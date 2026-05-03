import { $ } from "bun";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { AfkTodo, PlannedIssue } from "./state.ts";

// ---------------------------------------------------------------------------
// AgentRunner — swappable backend (Claude / Codex / Gemini / etc.)
// ---------------------------------------------------------------------------

export interface AgentRunOpts {
  promptText: string;
  cwd: string;
  signal: AbortSignal;
  /** Parsed text events (assistant message text). Used for capture + idle reset. */
  onText: (chunk: string) => void;
  /** Raw output bytes for transcript logging. */
  onRaw: (chunk: string) => void;
}

export interface AgentRunResult {
  exitCode: number;
  stderrTail: string;
}

export interface AgentRunner {
  run(opts: AgentRunOpts): Promise<AgentRunResult>;
}

export class AgentRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRateLimitError";
  }
}

// ---------------------------------------------------------------------------
// Clock — testable timers for idle timeout + retry backoff
// ---------------------------------------------------------------------------

export interface ClockTimer {
  clear(): void;
}

export interface Clock {
  setTimeout(fn: () => void, ms: number): ClockTimer;
  /** Sleep, but reject with Error("aborted") if the signal aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export function realClock(): Clock {
  return {
    setTimeout(fn, ms) {
      const id = setTimeout(fn, ms);
      return { clear: () => clearTimeout(id) };
    },
    sleep(ms, signal) {
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// AFK phase API
// ---------------------------------------------------------------------------

export interface Phases {
  runPlanner(args: {
    iteration: number;
    signal: AbortSignal;
  }): Promise<PlannedIssue[]>;
  runImplementer(args: {
    todo: AfkTodo;
    cwd: string;
    signal: AbortSignal;
  }): Promise<void>;
  runReviewer(args: {
    todo: AfkTodo;
    cwd: string;
    baseBranch: string;
    signal: AbortSignal;
  }): Promise<void>;
  runMerger(args: {
    iteration: number;
    todos: AfkTodo[];
    signal: AbortSignal;
  }): Promise<void>;
}

export interface PhasesDeps {
  runner: AgentRunner;
  config: Config;
  clock: Clock;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Internals — prompt prep, capture/idle/retry wrapper
// ---------------------------------------------------------------------------

type CaptureMode = "plan" | "none";

interface RunPhaseOpts {
  name: string;
  promptFile: string;
  promptArgs: Record<string, string>;
  cwd: string;
  logFile: string;
  capture: CaptureMode;
  signal: AbortSignal;
}

interface RunPhaseResult {
  output: string;
  exitCode: number;
}

async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  const shellPromise = $`${{ raw: cmd }}`.cwd(cwd).quiet().nothrow();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(new Error(`shell \`${cmd}\` timed out after ${timeoutMs}ms`)),
      timeoutMs,
    ),
  );
  const result = await Promise.race([shellPromise, timeoutPromise]);
  if (result.exitCode !== 0) {
    throw new Error(
      `shell \`${cmd}\` failed (${result.exitCode}): ${result.stderr
        .toString()
        .trim()}`,
    );
  }
  return result.stdout.toString().trim();
}

async function preprocessPrompt(
  filePath: string,
  args: Record<string, string>,
  config: Config,
): Promise<string> {
  let content = await readFile(filePath, "utf8");

  content = content.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (_, key: string) => {
      if (!(key in args)) {
        throw new Error(`Missing prompt arg "${key}" for ${filePath}`);
      }
      return args[key]!;
    },
  );

  const shellMatches = [...content.matchAll(/!`([^`]+)`/g)];
  const shellResults = await Promise.all(
    shellMatches.map((m) =>
      runShell(m[1]!, config.repoRoot, config.shellTimeoutMs),
    ),
  );
  for (let i = shellMatches.length - 1; i >= 0; i--) {
    const m = shellMatches[i]!;
    content =
      content.slice(0, m.index) +
      shellResults[i] +
      content.slice(m.index! + m[0].length);
  }

  return content;
}

async function runPhase(
  opts: RunPhaseOpts,
  deps: PhasesDeps,
): Promise<RunPhaseResult> {
  const { runner, config, clock, logger } = deps;

  const promptText = await preprocessPrompt(
    opts.promptFile,
    opts.promptArgs,
    config,
  );

  await mkdir(dirname(opts.logFile), { recursive: true });
  const logSink = Bun.file(opts.logFile).writer();

  const idleAc = new AbortController();
  const startIdleTimer = (): ClockTimer =>
    clock.setTimeout(() => idleAc.abort(), config.agentIdleTimeoutMs);
  let idleTimer = startIdleTimer();
  const resetIdle = () => {
    idleTimer.clear();
    idleTimer = startIdleTimer();
  };

  // Combined signal aborts on external request OR idle timeout.
  const combinedSignal = AbortSignal.any([opts.signal, idleAc.signal]);

  let planBuf = "";
  let planMatch: string | undefined;

  logger.info(`[${opts.name}] ▶ started (cwd=${opts.cwd})`);

  let result: AgentRunResult;
  try {
    result = await runner.run({
      promptText,
      cwd: opts.cwd,
      signal: combinedSignal,
      onRaw: (chunk) => {
        resetIdle();
        logSink.write(chunk);
      },
      onText: (chunk) => {
        const trimmed = chunk.trim();
        if (trimmed) {
          const firstLine = trimmed.split("\n")[0]!.slice(0, 200);
          logger.info(`[${opts.name}] ${firstLine}`);
        }
        if (opts.capture === "plan" && planMatch === undefined) {
          planBuf += chunk;
          if (planBuf.length > config.planBufferLimit) {
            planBuf = planBuf.slice(-config.planBufferLimit);
          }
          const m = planBuf.match(/<plan>([\s\S]*?)<\/plan>/);
          if (m) {
            planMatch = m[1]!;
            planBuf = "";
          }
        }
      },
    });
  } finally {
    idleTimer.clear();
    try {
      await logSink.flush();
    } catch {}
    logSink.end();
  }

  if (opts.signal.aborted) {
    throw new Error(`[${opts.name}] aborted`);
  }
  if (idleAc.signal.aborted) {
    throw new Error(
      `[${opts.name}] idle timeout — no output for ${Math.round(
        config.agentIdleTimeoutMs / 1000,
      )}s`,
    );
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `[${opts.name}] runner exited ${result.exitCode}: stderr=${result.stderrTail.trim().slice(-300)}`,
    );
  }

  logger.info(`[${opts.name}] ◀ done (exit=${result.exitCode})`);

  const output = opts.capture === "plan" ? (planMatch ?? "") : "";
  return { output, exitCode: result.exitCode };
}

async function runPhaseWithRetry(
  opts: RunPhaseOpts,
  deps: PhasesDeps,
): Promise<RunPhaseResult> {
  const { config, clock, logger } = deps;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.rateLimitMaxRetries; attempt++) {
    if (opts.signal.aborted) {
      throw new Error(`[${opts.name}] aborted before start`);
    }
    try {
      return await runPhase(opts, deps);
    } catch (err) {
      lastErr = err;
      const isRateLimit = err instanceof AgentRateLimitError;
      if (!isRateLimit || attempt === config.rateLimitMaxRetries) {
        throw err;
      }
      const jitter = Math.random() * 30_000;
      const delayMs =
        config.rateLimitBackoffMs * Math.pow(2, attempt) + jitter;
      logger.info(
        `[${opts.name}] rate limited, retry in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${config.rateLimitMaxRetries})`,
      );
      await clock.sleep(delayMs, opts.signal);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// createPhases — AFK domain wrappers
// ---------------------------------------------------------------------------

export function createPhases(deps: PhasesDeps): Phases {
  const { config } = deps;

  const planPromptFile = join(config.scriptDir, "plan-prompt.md");
  const implementPromptFile = join(config.scriptDir, "implement-prompt.md");
  const reviewPromptFile = join(config.scriptDir, "review-prompt.md");
  const mergePromptFile = join(config.scriptDir, "merge-prompt.md");

  return {
    async runPlanner({ iteration, signal }) {
      const result = await runPhaseWithRetry(
        {
          name: `plan/${iteration}`,
          promptFile: planPromptFile,
          promptArgs: {},
          cwd: config.repoRoot,
          logFile: join(config.logsDir, `iteration-${iteration}__plan.jsonl`),
          capture: "plan",
          signal,
        },
        deps,
      );

      if (!result.output) {
        throw new Error(
          `Planner produced no <plan> tag in iteration ${iteration}.`,
        );
      }

      const parsed = JSON.parse(result.output) as { issues: PlannedIssue[] };
      for (const i of parsed.issues) {
        const expectedPrefix = `${config.issueBranchPrefix}${i.number}-`;
        if (!i.branch || !i.branch.startsWith(expectedPrefix)) {
          throw new Error(
            `Planner returned invalid branch name for issue #${i.number}: ${JSON.stringify(i.branch)}. Expected prefix "${expectedPrefix}".`,
          );
        }
        if (!/^afk\/issue-\d+-[a-z0-9-]+$/.test(i.branch)) {
          throw new Error(
            `Planner returned non-conforming branch name: ${i.branch}.`,
          );
        }
      }
      return parsed.issues;
    },

    async runImplementer({ todo, cwd, signal }) {
      await runPhaseWithRetry(
        {
          name: `impl/#${todo.number}`,
          promptFile: implementPromptFile,
          promptArgs: {
            ISSUE_NUMBER: String(todo.number),
            ISSUE_TITLE: todo.title,
            BRANCH: todo.branch,
          },
          cwd,
          logFile: join(config.logsDir, `${todo.worktreeDir}__implement.jsonl`),
          capture: "none",
          signal,
        },
        deps,
      );
    },

    async runReviewer({ todo, cwd, baseBranch, signal }) {
      await runPhaseWithRetry(
        {
          name: `review/#${todo.number}`,
          promptFile: reviewPromptFile,
          promptArgs: {
            ISSUE_NUMBER: String(todo.number),
            ISSUE_TITLE: todo.title,
            BRANCH: todo.branch,
            BASE_BRANCH: baseBranch,
          },
          cwd,
          logFile: join(config.logsDir, `${todo.worktreeDir}__review.jsonl`),
          capture: "none",
          signal,
        },
        deps,
      );
    },

    async runMerger({ iteration, todos, signal }) {
      await runPhaseWithRetry(
        {
          name: `merge/${iteration}`,
          promptFile: mergePromptFile,
          promptArgs: {
            BRANCHES: todos.map((c) => `- ${c.branch}`).join("\n"),
            ISSUES: todos
              .map((c) => `- #${c.number}: ${c.title}`)
              .join("\n"),
          },
          cwd: config.repoRoot,
          logFile: join(config.logsDir, `iteration-${iteration}__merge.jsonl`),
          capture: "none",
          signal,
        },
        deps,
      );
    },
  };
}
