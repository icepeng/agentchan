/**
 * Hook runner. Spawns TS/JS files via the bundled Bun runtime
 * (`process.execPath` + `BUN_BE_BUN=1`, same trick as the script tool).
 *
 * Protocol: hook gets the event payload as JSON on stdin and responds by
 *   - exit 0 + JSON on stdout → parsed as HookResponse
 *   - exit 0 + anything else → no-op success
 *   - exit 2 + reason on stderr → block
 *   - any other exit → non-blocking error (logged)
 */

import { resolve } from "node:path";
import * as log from "../logger.js";
import { loadHookConfig } from "./config.js";
import type {
  CompiledHook,
  CompiledHookConfig,
  HookExecResult,
  HookInput,
  HookResponse,
  HookRunner,
} from "./types.js";

interface RunnerOptions {
  projectDir: string;
  sessionId: string;
}

interface SingleHookOutcome {
  blocked: boolean;
  reason?: string;
  response?: HookResponse;
}

const REAP_GRACE_MS = 1000;

function matchesHook(hook: CompiledHook, toolName?: string): boolean {
  if (!hook.matcher || !toolName) return true;
  return hook.matcher.test(toolName);
}

async function readStream(stream: ReadableStream | null): Promise<string> {
  if (!stream) return "";
  try {
    return await new Response(stream).text();
  } catch {
    return "";
  }
}

function parseJsonResponse(stdout: string): HookResponse | undefined {
  const trimmed = stdout.trim();
  if (!trimmed || !trimmed.startsWith("{")) return undefined;
  try {
    return JSON.parse(trimmed) as HookResponse;
  } catch (err) {
    log.warn("hooks", `failed to parse hook stdout as JSON: ${(err as Error).message}`);
    return undefined;
  }
}

async function executeHook(
  hook: CompiledHook,
  input: HookInput,
  projectDir: string,
): Promise<SingleHookOutcome> {
  const scriptPath = resolve(projectDir, hook.file);
  const payload = new TextEncoder().encode(JSON.stringify(input));

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([process.execPath, "run", scriptPath], {
      cwd: projectDir,
      stdin: payload,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
        AGENTCHAN_PROJECT_DIR: projectDir,
        AGENTCHAN_SESSION_ID: input.session_id,
        AGENTCHAN_HOOK_EVENT: input.hook_event_name,
      },
    });
  } catch (err) {
    log.warn("hooks", `failed to spawn ${hook.file}: ${(err as Error).message}`);
    return { blocked: false };
  }

  const stdoutPromise = readStream(proc.stdout as ReadableStream);
  const stderrPromise = readStream(proc.stderr as ReadableStream);
  const exitPromise = proc.exited;

  let timerId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {
        // already exited
      }
      reject(new Error(`hook ${hook.file} timed out after ${hook.timeout}ms`));
    }, hook.timeout);
  });

  const resultPromise = (async () => {
    const [stdout, stderr, exitCode] = await Promise.all([
      stdoutPromise,
      stderrPromise,
      exitPromise,
    ]);
    return { stdout, stderr, exitCode };
  })();

  let stdout: string;
  let stderr: string;
  let exitCode: number;
  try {
    const r = await Promise.race([resultPromise, timeoutPromise]);
    stdout = r.stdout;
    stderr = r.stderr;
    exitCode = r.exitCode;
  } catch (err) {
    log.warn("hooks", (err as Error).message);
    if (timedOut) {
      // Ensure the killed child is reaped and stream readers don't dangle.
      await Promise.race([
        Promise.all([stdoutPromise, stderrPromise, exitPromise]),
        new Promise((r) => setTimeout(r, REAP_GRACE_MS)),
      ]).catch(() => {});
    }
    return { blocked: false };
  } finally {
    if (timerId) clearTimeout(timerId);
  }

  if (exitCode === 2) {
    const reason = stderr.trim() || `hook ${hook.file} blocked the action`;
    log.info("hooks", `${input.hook_event_name} blocked by ${hook.file}: ${reason}`);
    return { blocked: true, reason };
  }

  if (exitCode !== 0) {
    log.warn(
      "hooks",
      `${hook.file} exited ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
    );
    return { blocked: false };
  }

  const response = parseJsonResponse(stdout);
  if (response?.continue === false) {
    const reason = response.reason ?? `hook ${hook.file} blocked the action`;
    log.info("hooks", `${input.hook_event_name} blocked by ${hook.file}: ${reason}`);
    return { blocked: true, reason, response };
  }

  return { blocked: false, response };
}

function buildRunner(opts: RunnerOptions, config: CompiledHookConfig): HookRunner {
  const { projectDir, sessionId } = opts;
  const totalHooks = Object.values(config).reduce((n, arr) => n + (arr?.length ?? 0), 0);

  return {
    isEmpty: () => totalHooks === 0,
    has: (event) => (config[event]?.length ?? 0) > 0,

    async run(event, partial): Promise<HookExecResult> {
      const hooks = config[event];
      const result: HookExecResult = { blocked: false };
      if (!hooks || hooks.length === 0) return result;

      const applicable = hooks.filter((h) => matchesHook(h, partial.tool_name));
      if (applicable.length === 0) return result;

      const input: HookInput = {
        hook_event_name: event,
        session_id: sessionId,
        project_dir: projectDir,
        ...partial,
      };

      // Sequential: first blocking hook wins. Parallel would race block
      // decisions and make PreToolUse reasoning non-deterministic.
      const additionalContextParts: string[] = [];
      for (const hook of applicable) {
        const outcome = await executeHook(hook, input, projectDir);
        const resp = outcome.response;
        if (resp?.hookSpecificOutput?.updatedInput !== undefined) {
          result.updatedInput = resp.hookSpecificOutput.updatedInput;
        }
        if (resp?.hookSpecificOutput?.additionalContext) {
          additionalContextParts.push(resp.hookSpecificOutput.additionalContext);
        }
        if (outcome.blocked && !result.blocked) {
          result.blocked = true;
          result.reason = outcome.reason;
        }
      }

      if (additionalContextParts.length > 0) {
        result.additionalContext = additionalContextParts.join("\n\n");
      }

      return result;
    },
  };
}

/**
 * Create a HookRunner for a project. Reads `hooks.json` once; missing file
 * yields an empty runner (every `run` call is a no-op).
 */
export async function createHookRunner(opts: RunnerOptions): Promise<HookRunner> {
  const config = await loadHookConfig(opts.projectDir);
  return buildRunner(opts, config);
}
