#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ----------------------------------------------------------------------------
// CLI args
// ----------------------------------------------------------------------------

const cliArgs = process.argv.slice(2);
const isInit = cliArgs.includes("--init");
const forceReset = cliArgs.includes("--force-reset");
const isResume = cliArgs.includes("--resume");

function parsePositiveIntegerOption(
  names: string[],
  fallback: number,
): number {
  for (const name of names) {
    const equalsPrefix = `${name}=`;
    const equalsValue = cliArgs.find((arg) => arg.startsWith(equalsPrefix));
    const index = cliArgs.indexOf(name);
    const value = equalsValue?.slice(equalsPrefix.length) ?? cliArgs[index + 1];

    if (equalsValue === undefined && index === -1) {
      continue;
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} requires a positive integer value`);
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer, got: ${value}`);
    }
    return parsed;
  }

  if (!Number.isInteger(fallback) || fallback < 1) {
    throw new Error(
      `MAX_ITERATIONS must be a positive integer, got: ${fallback}`,
    );
  }

  return fallback;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const PARALLEL = Number(process.env.PARALLEL ?? 1);
const RATE_LIMIT_MAX_RETRIES = Number(process.env.RATE_LIMIT_MAX_RETRIES ?? 3);
const RATE_LIMIT_BACKOFF_MS = Number(process.env.RATE_LIMIT_BACKOFF_MS ?? 60_000);
const WORKTREE_REMOVE_MAX_ATTEMPTS = 3;
const WORKTREE_REMOVE_RETRY_DELAY_MS = 500;
const MAX_ITERATIONS = parsePositiveIntegerOption(
  ["--iterations", "--iteration"],
  Number(process.env.MAX_ITERATIONS ?? 10),
);
const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-opus-4-7";
const SHELL_TIMEOUT_MS = 30_000;
const AGENT_IDLE_TIMEOUT_MS = Number(
  process.env.AGENT_IDLE_TIMEOUT_MS ?? 10 * 60 * 1000,
);
const STDERR_TAIL_LIMIT = 8_192;
const PLAN_BUFFER_LIMIT = 256 * 1024;
const MAIN_BRANCH = process.env.MAIN_BRANCH ?? "main";
const AFK_BRANCH = "afk/integration";
const STATE_VERSION = 1;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = await runGit(["rev-parse", "--show-toplevel"]);
const GIT_DIR = await runGit(["rev-parse", "--git-dir"]);
const GIT_COMMON_DIR = await runGit(["rev-parse", "--git-common-dir"]);
const IS_MAIN_CHECKOUT = GIT_DIR === GIT_COMMON_DIR;
const WORKTREES_DIR = join(dirname(REPO_ROOT), `${basename(REPO_ROOT)}-wt`);
const LOGS_DIR = join(REPO_ROOT, ".claude", "automate", "logs");
const AFK_DIR = join(REPO_ROOT, ".afk");
const STATE_FILE = join(AFK_DIR, "state.json");
const ISSUE_BRANCH_PREFIX = "afk/issue-";
const ISSUE_DIR_PREFIX = "issue-";

// Strip API auth so spawned claude falls back to the Max subscription login
// instead of billing the API key.
const CLAUDE_AGENT_ENV: Record<string, string | undefined> = (() => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
})();

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface PlannedIssue {
  number: number;
  title: string;
  branch: string;
}

type TodoStatus =
  | "planned"
  | "impl_done"
  | "review_done"
  | "merged"
  | "failed";

interface AfkTodo {
  number: number;
  title: string;
  branch: string;
  worktreeDir: string;
  status: TodoStatus;
  commits: number;
  error?: string;
}

interface AfkState {
  version: typeof STATE_VERSION;
  iteration: number;
  baseBranch: string;
  startedAt: string;
  updatedAt: string;
  todos: AfkTodo[];
}

interface AgentRunResult {
  /** Captured output: <plan> body for capture="plan", final result text for "result", "" for "none". */
  output: string;
  exitCode: number;
}

type CaptureMode = "plan" | "result" | "none";

// ----------------------------------------------------------------------------
// Cancellation
// ----------------------------------------------------------------------------

const abortController = new AbortController();
let sigintCount = 0;

function isAborted(): boolean {
  return abortController.signal.aborted;
}

// ----------------------------------------------------------------------------
// git / shell helpers
// ----------------------------------------------------------------------------

async function runGit(
  args: string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  if (exit !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${exit}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  const shellPromise = $`${{ raw: cmd }}`.cwd(cwd).quiet().nothrow();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`shell \`${cmd}\` timed out after ${timeoutMs}ms`)),
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
    shellMatches.map((m) => runShell(m[1]!, REPO_ROOT, SHELL_TIMEOUT_MS)),
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

// ----------------------------------------------------------------------------
// Stream parsing — produces typed events without buffering full transcript
// ----------------------------------------------------------------------------

interface StreamEvent {
  type: "text" | "result";
  text: string;
}

function parseStreamLine(line: string): StreamEvent[] {
  if (!line.trim()) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return [];
  }
  const events: StreamEvent[] = [];
  const o = obj as Record<string, unknown>;
  if (o.type === "assistant") {
    const message = o.message as
      | { content?: Array<{ type: string; text?: string }> }
      | undefined;
    for (const block of message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        events.push({ type: "text", text: block.text });
      }
    }
  } else if (o.type === "result" && typeof o.result === "string") {
    events.push({ type: "result", text: o.result });
  }
  return events;
}

// ----------------------------------------------------------------------------
// runAgent — bounded memory, stderr drain, idle timeout, AbortSignal
// ----------------------------------------------------------------------------

interface RunAgentOpts {
  name: string;
  promptFile: string;
  promptArgs: Record<string, string>;
  cwd: string;
  logFile: string;
  capture: CaptureMode;
  signal: AbortSignal;
  idleTimeoutMs?: number;
}

async function runAgent(opts: RunAgentOpts): Promise<AgentRunResult> {
  const promptText = await preprocessPrompt(opts.promptFile, opts.promptArgs);

  await mkdir(dirname(opts.logFile), { recursive: true });
  const logSink = Bun.file(opts.logFile).writer();

  const idleTimeoutMs = opts.idleTimeoutMs ?? AGENT_IDLE_TIMEOUT_MS;

  const proc = Bun.spawn(
    [
      "claude",
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "--model",
      AGENT_MODEL,
      "-p",
      "-",
    ],
    {
      cwd: opts.cwd,
      env: CLAUDE_AGENT_ENV,
      stdin: new TextEncoder().encode(promptText),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Drain stderr in the background and keep only a tail. An undrained pipe
  // can fill the OS buffer and stall or crash the parent.
  let stderrTail = "";
  const stderrPromise = (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
        stderrTail += decoder.decode(chunk, { stream: true });
        if (stderrTail.length > STDERR_TAIL_LIMIT) {
          stderrTail = stderrTail.slice(-STDERR_TAIL_LIMIT);
        }
      }
    } catch {
      // Ignore — process tear-down may close the stream mid-read.
    }
  })();

  // Termination reason wins over exit code so we report meaningfully.
  let killReason: "abort" | "idle" | null = null;
  const killProc = (reason: "abort" | "idle") => {
    if (killReason !== null) return;
    killReason = reason;
    try {
      proc.kill("SIGTERM");
    } catch {
      // already dead
    }
  };

  const onAbort = () => killProc("abort");
  if (opts.signal.aborted) {
    killProc("abort");
  } else {
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => killProc("idle"), idleTimeoutMs);
  };
  armIdle();

  process.stdout.write(`[${opts.name}] ▶ started (cwd=${opts.cwd})\n`);

  // Capture state — bounded.
  let planBuf = ""; // only when capture === "plan"
  let planMatch: string | undefined;
  let resultText = ""; // only when capture === "result"

  const decoder = new TextDecoder();
  let lineBuf = "";

  try {
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      armIdle();
      const str = decoder.decode(chunk, { stream: true });
      logSink.write(str);
      lineBuf += str;
      let nl: number;
      while ((nl = lineBuf.indexOf("\n")) >= 0) {
        const line = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        for (const evt of parseStreamLine(line)) {
          if (evt.type === "text") {
            const trimmed = evt.text.trim();
            if (trimmed) {
              const firstLine = trimmed.split("\n")[0]!.slice(0, 200);
              process.stdout.write(`[${opts.name}] ${firstLine}\n`);
            }
            if (opts.capture === "plan" && planMatch === undefined) {
              planBuf += evt.text;
              if (planBuf.length > PLAN_BUFFER_LIMIT) {
                planBuf = planBuf.slice(-PLAN_BUFFER_LIMIT);
              }
              const m = planBuf.match(/<plan>([\s\S]*?)<\/plan>/);
              if (m) {
                planMatch = m[1]!;
                planBuf = ""; // free memory
              }
            }
          } else if (evt.type === "result") {
            if (opts.capture === "result") resultText = evt.text;
          }
        }
      }
    }
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    opts.signal.removeEventListener("abort", onAbort);
    try {
      await logSink.flush();
    } catch {}
    logSink.end();
  }

  await stderrPromise;
  const exitCode = await proc.exited;

  if (killReason === "abort") {
    throw new Error(`[${opts.name}] aborted`);
  }
  if (killReason === "idle") {
    throw new Error(
      `[${opts.name}] idle timeout — no output for ${Math.round(
        idleTimeoutMs / 1000,
      )}s`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(
      `[${opts.name}] claude exited ${exitCode}: stderr=${stderrTail.trim().slice(-300)}`,
    );
  }

  process.stdout.write(`[${opts.name}] ◀ done (exit=${exitCode})\n`);

  let output = "";
  if (opts.capture === "plan") output = planMatch ?? "";
  else if (opts.capture === "result") output = resultText;

  return { output, exitCode };
}

function isRateLimitError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  );
}

async function runAgentWithRetry(opts: RunAgentOpts): Promise<AgentRunResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    if (isAborted()) throw new Error(`[${opts.name}] aborted before start`);
    try {
      return await runAgent(opts);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt === RATE_LIMIT_MAX_RETRIES) {
        throw err;
      }
      const jitter = Math.random() * 30_000;
      const delayMs = RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt) + jitter;
      console.log(
        `[${opts.name}] rate limited, retry in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
      );
      await sleepInterruptible(delayMs);
    }
  }
  throw lastErr;
}

function sleepInterruptible(ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      abortController.signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    abortController.signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ----------------------------------------------------------------------------
// State persistence — atomic JSON writes
// ----------------------------------------------------------------------------

async function loadState(): Promise<AfkState | null> {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as AfkState;
    if (parsed.version !== STATE_VERSION) {
      console.warn(
        `state.json has version ${parsed.version}, expected ${STATE_VERSION}. Treating as missing.`,
      );
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`Failed to read ${STATE_FILE}: ${err}. Treating as missing.`);
    return null;
  }
}

async function saveState(state: AfkState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(AFK_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, STATE_FILE);
}

async function clearState(): Promise<void> {
  await rm(STATE_FILE, { force: true });
}

// ----------------------------------------------------------------------------
// Worktree management
// ----------------------------------------------------------------------------

async function createOrReuseWorktree(
  branch: string,
  worktreeDir: string,
  baseBranch: string,
): Promise<string> {
  await mkdir(WORKTREES_DIR, { recursive: true });
  const path = join(WORKTREES_DIR, worktreeDir);

  // If the directory already exists and is registered as a worktree on the
  // expected branch, reuse it.
  if (existsSync(path)) {
    try {
      const head = await runGit(["symbolic-ref", "--short", "HEAD"], path);
      if (head === branch) return path;
      // Different branch — fall through to forced re-add below.
    } catch {
      // Not a valid git worktree; will retry add.
    }
  }

  try {
    await runGit(["worktree", "add", "-b", branch, path, baseBranch]);
    return path;
  } catch {
    // Branch already exists — attach without -b.
    await runGit(["worktree", "add", path, branch]);
    return path;
  }
}

async function isWorktreeDirty(path: string): Promise<boolean> {
  const out = await runGit(["status", "--porcelain"], path);
  return out.length > 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateWindowsProcessesHoldingPath(path: string): Promise<void> {
  if (process.platform !== "win32" || !existsSync(path)) return;

  // Match by command line only. A module-scan pass was tried earlier but it
  // killed the parent bun.exe when it had any DLL loaded from the worktree's
  // node_modules, ending the run silently right after review.
  const script = String.raw`
$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path -LiteralPath $args[0]).Path.TrimEnd("\")
$self = $PID
$locked = @{}

Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $self -and
    $_.CommandLine -and
    $_.CommandLine.Contains($root)
  } |
  ForEach-Object {
    $locked[[int]$_.ProcessId] = "command line"
  }

foreach ($id in $locked.Keys) {
  try {
    $proc = Get-Process -Id $id -ErrorAction Stop
    Write-Output ("stopping {0} ({1}) via {2}" -f $proc.ProcessName, $id, $locked[$id])
    Stop-Process -Id $id -Force -ErrorAction Stop
  } catch {}
}
`;

  const proc = Bun.spawn(
    [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
      path,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (stdout.trim()) {
    console.log(`[worktree cleanup] ${stdout.trim().replace(/\r?\n/g, "; ")}`);
  }
  if (exitCode !== 0 && stderr.trim()) {
    console.warn(
      `[worktree cleanup] process scan failed (${exitCode}): ${stderr.trim().slice(0, 300)}`,
    );
  }
}

async function removeWorktree(path: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= WORKTREE_REMOVE_MAX_ATTEMPTS; attempt++) {
    try {
      await runGit(["worktree", "remove", "--force", path]);
      return;
    } catch (err) {
      lastError = err;
      if (attempt === WORKTREE_REMOVE_MAX_ATTEMPTS) break;

      await terminateWindowsProcessesHoldingPath(path);
      await delay(WORKTREE_REMOVE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function commitsOnBranch(
  branch: string,
  base: string,
): Promise<string[]> {
  const out = await runGit(["log", `${base}..${branch}`, "--format=%H"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

async function listAfkIssueBranches(): Promise<string[]> {
  const out = await runGit([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/afk/issue-",
  ]);
  return out ? out.split("\n").filter(Boolean) : [];
}

// ----------------------------------------------------------------------------
// Concurrency
// ----------------------------------------------------------------------------

function makeSemaphore(max: number): {
  acquire: () => Promise<void>;
  release: () => void;
} {
  let running = 0;
  const queue: Array<() => void> = [];
  return {
    acquire(): Promise<void> {
      if (running < max) {
        running++;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => queue.push(resolve));
    },
    release(): void {
      running--;
      const next = queue.shift();
      if (next) {
        running++;
        next();
      }
    },
  };
}

// ----------------------------------------------------------------------------
// Init mode
// ----------------------------------------------------------------------------

async function initMode(): Promise<void> {
  if (!IS_MAIN_CHECKOUT) {
    throw new Error(
      `--init must run from the main checkout, not from a worktree.\n` +
        `Current toplevel: ${REPO_ROOT}\n` +
        `git-dir:          ${GIT_DIR}`,
    );
  }

  const afkPath = join(dirname(REPO_ROOT), `${basename(REPO_ROOT)}-afk`);
  if (existsSync(afkPath)) {
    throw new Error(
      `AFK worktree path already exists: ${afkPath}\n` +
        `Remove the directory and run \`git worktree prune\` if you want to recreate it,\n` +
        `or just \`cd ${afkPath}\` and \`bun scripts/afk/run.ts\` to use it.`,
    );
  }

  await runGit(["rev-parse", "--verify", MAIN_BRANCH]);

  try {
    await runGit(["worktree", "add", "-b", AFK_BRANCH, afkPath, MAIN_BRANCH]);
  } catch {
    await runGit(["worktree", "add", afkPath, AFK_BRANCH]);
  }

  console.log(`Running bun install in ${afkPath} ...`);
  const installProc = Bun.spawn(["bun", "install"], {
    cwd: afkPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await installProc.exited) !== 0) {
    throw new Error(`bun install failed in ${afkPath}`);
  }

  console.log("");
  console.log("AFK worktree initialized.");
  console.log(`  path:   ${afkPath}`);
  console.log(`  branch: ${AFK_BRANCH} (forked from ${MAIN_BRANCH})`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${afkPath}`);
  console.log("  bun scripts/afk/run.ts");
}

// ----------------------------------------------------------------------------
// Preflight — validates host repo state
// ----------------------------------------------------------------------------

async function preflight(): Promise<{ baseBranch: string }> {
  if (IS_MAIN_CHECKOUT) {
    throw new Error(
      `Refusing to run from the main checkout. AFK pipeline must run from its dedicated worktree.\n` +
        `Bootstrap with \`bun scripts/afk/run.ts --init\` from the main checkout, then run from the AFK worktree.\n` +
        `Current toplevel: ${REPO_ROOT}`,
    );
  }

  const currentBranch = await runGit(["symbolic-ref", "--short", "HEAD"]);
  if (currentBranch !== AFK_BRANCH) {
    throw new Error(
      `Current branch is "${currentBranch}", expected "${AFK_BRANCH}". AFK pipeline only runs on the integration branch.`,
    );
  }

  const dirty = await runGit(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    throw new Error(
      `AFK worktree has uncommitted changes on ${AFK_BRANCH}. Stash or commit before running.`,
    );
  }

  const ghProc = Bun.spawn(["gh", "auth", "status"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if ((await ghProc.exited) !== 0) {
    throw new Error("gh CLI not authenticated. Run `gh auth login`.");
  }

  await runGit(["rev-parse", "--verify", MAIN_BRANCH]);

  if (isResume) {
    // Resume mode: keep whatever state integration branch is in. We rely on
    // state.json (or live afk/issue-* branches) to decide what to do next.
    console.log(
      `Resume mode: skipping ${AFK_BRANCH} reset. Existing commits/worktrees will be picked up.`,
    );
    return { baseBranch: AFK_BRANCH };
  }

  const ahead = await runGit(["log", `${MAIN_BRANCH}..HEAD`, "--format=%H"]);
  const aheadCount = ahead ? ahead.split("\n").filter(Boolean).length : 0;
  if (aheadCount > 0 && !forceReset) {
    throw new Error(
      `${AFK_BRANCH} has ${aheadCount} commit(s) not in ${MAIN_BRANCH}.\n` +
        `These may be unreviewed work, or commits you discarded after squash-merging selected ones.\n` +
        `Options:\n` +
        `  - bun scripts/afk/run.ts --resume       (continue the previous run)\n` +
        `  - bun scripts/afk/run.ts --force-reset  (discard the commits)\n\n` +
        `Unmerged commits (${MAIN_BRANCH}..${AFK_BRANCH}):\n${ahead}`,
    );
  }
  if (aheadCount > 0) {
    console.log(
      `Discarding ${aheadCount} commit(s) on ${AFK_BRANCH} (--force-reset).`,
    );
  }

  await runGit(["reset", "--hard", MAIN_BRANCH]);
  console.log(`Reset ${AFK_BRANCH} to ${MAIN_BRANCH}.`);

  return { baseBranch: AFK_BRANCH };
}

// ----------------------------------------------------------------------------
// Iteration body — works against an AfkState so it's resumable
// ----------------------------------------------------------------------------

async function planIteration(
  iteration: number,
  baseBranch: string,
): Promise<AfkState | null> {
  const planResult = await runAgentWithRetry({
    name: `plan/${iteration}`,
    promptFile: join(SCRIPT_DIR, "plan-prompt.md"),
    promptArgs: {},
    cwd: REPO_ROOT,
    logFile: join(LOGS_DIR, `iteration-${iteration}__plan.jsonl`),
    capture: "plan",
    signal: abortController.signal,
  });

  if (!planResult.output) {
    throw new Error(`Planner produced no <plan> tag in iteration ${iteration}.`);
  }

  const parsed = JSON.parse(planResult.output) as { issues: PlannedIssue[] };
  if (parsed.issues.length === 0) {
    return null;
  }

  const todos: AfkTodo[] = parsed.issues.map((i) => {
    const expectedPrefix = `${ISSUE_BRANCH_PREFIX}${i.number}-`;
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
    return {
      number: i.number,
      title: i.title,
      branch: i.branch,
      worktreeDir: `${ISSUE_DIR_PREFIX}${i.number}`,
      status: "planned",
      commits: 0,
    };
  });

  const now = new Date().toISOString();
  const state: AfkState = {
    version: STATE_VERSION,
    iteration,
    baseBranch,
    startedAt: now,
    updatedAt: now,
    todos,
  };
  await saveState(state);
  return state;
}

/** Drives one todo from its current status toward review_done or failed. */
async function progressTodo(
  state: AfkState,
  todo: AfkTodo,
  baseBranch: string,
): Promise<void> {
  const wtPath = join(WORKTREES_DIR, todo.worktreeDir);

  if (todo.status === "planned") {
    await createOrReuseWorktree(todo.branch, todo.worktreeDir, baseBranch);

    const installProc = Bun.spawn(["bun", "install"], {
      cwd: wtPath,
      stdout: "ignore",
      stderr: "pipe",
    });
    if ((await installProc.exited) !== 0) {
      const stderr = await new Response(installProc.stderr).text();
      throw new Error(
        `bun install failed in ${todo.branch}: ${stderr.trim().slice(0, 500)}`,
      );
    }

    await runAgentWithRetry({
      name: `impl/#${todo.number}`,
      promptFile: join(SCRIPT_DIR, "implement-prompt.md"),
      promptArgs: {
        ISSUE_NUMBER: String(todo.number),
        ISSUE_TITLE: todo.title,
        BRANCH: todo.branch,
      },
      cwd: wtPath,
      logFile: join(LOGS_DIR, `${todo.worktreeDir}__implement.jsonl`),
      capture: "none",
      signal: abortController.signal,
    });

    todo.commits = (await commitsOnBranch(todo.branch, baseBranch)).length;
    todo.status = "impl_done";
    await saveState(state);
  }

  if (todo.status === "impl_done") {
    if (todo.commits === 0) {
      todo.status = "failed";
      todo.error = "implementation produced no commits";
      await saveState(state);
      return;
    }

    try {
      await runAgentWithRetry({
        name: `review/#${todo.number}`,
        promptFile: join(SCRIPT_DIR, "review-prompt.md"),
        promptArgs: {
          ISSUE_NUMBER: String(todo.number),
          ISSUE_TITLE: todo.title,
          BRANCH: todo.branch,
          BASE_BRANCH: baseBranch,
        },
        cwd: wtPath,
        logFile: join(LOGS_DIR, `${todo.worktreeDir}__review.jsonl`),
        capture: "none",
        signal: abortController.signal,
      });
    } catch (err) {
      console.error(
        `[review/#${todo.number}] failed (continuing to merge): ${err}`,
      );
    }

    todo.commits = (await commitsOnBranch(todo.branch, baseBranch)).length;
    todo.status = "review_done";
    await saveState(state);
  }
}

async function executeTodos(
  state: AfkState,
  baseBranch: string,
): Promise<void> {
  const sem = makeSemaphore(PARALLEL);
  const settled = await Promise.allSettled(
    state.todos.map(async (todo) => {
      if (todo.status === "merged" || todo.status === "failed") return;
      if (todo.status === "review_done") return; // already past worker stage
      await sem.acquire();
      try {
        if (isAborted()) return;
        await progressTodo(state, todo, baseBranch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ #${todo.number} (${todo.branch}): ${msg}`);
        todo.status = "failed";
        todo.error = msg.slice(0, 500);
        try {
          await saveState(state);
        } catch {}
      } finally {
        sem.release();
      }
    }),
  );

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      console.error(`Worker rejected: ${outcome.reason}`);
    }
  }
}

async function mergeStep(
  state: AfkState,
  iteration: number,
): Promise<void> {
  const toMerge = state.todos.filter(
    (t) => t.status === "review_done" && t.commits > 0,
  );
  if (toMerge.length === 0) {
    console.log("No reviewed branches with commits. Skipping merge.");
    return;
  }

  console.log(`\nMerging ${toMerge.length} branch(es):`);
  for (const t of toMerge) console.log(`  ${t.branch}`);

  await runAgentWithRetry({
    name: `merge/${iteration}`,
    promptFile: join(SCRIPT_DIR, "merge-prompt.md"),
    promptArgs: {
      BRANCHES: toMerge.map((c) => `- ${c.branch}`).join("\n"),
      ISSUES: toMerge.map((c) => `- #${c.number}: ${c.title}`).join("\n"),
    },
    cwd: REPO_ROOT,
    logFile: join(LOGS_DIR, `iteration-${iteration}__merge.jsonl`),
    capture: "none",
    signal: abortController.signal,
  });

  for (const t of toMerge) {
    t.status = "merged";
  }
  await saveState(state);
  console.log("Branches merged.");
}

async function batchCleanup(state: AfkState): Promise<void> {
  for (const todo of state.todos) {
    if (todo.status !== "merged" && todo.status !== "failed") continue;
    const wtPath = join(WORKTREES_DIR, todo.worktreeDir);
    if (!existsSync(wtPath)) continue;

    try {
      if (await isWorktreeDirty(wtPath)) {
        console.log(`[${todo.branch}] preserved (dirty)`);
      } else {
        await removeWorktree(wtPath);
      }
    } catch (err) {
      console.error(`[${todo.branch}] cleanup failed: ${err}`);
    }
  }
}

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------

async function runIteration(
  iteration: number,
  baseBranch: string,
  resumedState: AfkState | null,
): Promise<"continue" | "stop"> {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  let state: AfkState;
  if (resumedState) {
    console.log(
      `Resuming iteration ${resumedState.iteration} with ${resumedState.todos.length} todo(s):`,
    );
    for (const t of resumedState.todos) {
      console.log(`  [${t.status}] #${t.number}: ${t.title} (${t.branch})`);
    }
    state = resumedState;
  } else {
    const planned = await planIteration(iteration, baseBranch);
    if (planned === null) {
      console.log("No issues to work on. Exiting.");
      return "stop";
    }
    state = planned;
    console.log(`${state.todos.length} issue(s) to work in parallel:`);
    for (const t of state.todos)
      console.log(`  #${t.number}: ${t.title} → ${t.branch}`);
  }

  await executeTodos(state, baseBranch);
  if (isAborted()) return "stop";

  await mergeStep(state, iteration);
  if (isAborted()) return "stop";

  await batchCleanup(state);
  await clearState();
  return "continue";
}

async function main(): Promise<void> {
  const { baseBranch } = await preflight();

  console.log(`Base branch: ${baseBranch}`);
  console.log(`Model: ${AGENT_MODEL}`);
  console.log(`Parallel: ${PARALLEL} | Max iterations: ${MAX_ITERATIONS}`);
  console.log(`Idle timeout: ${Math.round(AGENT_IDLE_TIMEOUT_MS / 1000)}s`);

  let resumedState: AfkState | null = null;
  if (isResume) {
    resumedState = await loadState();
    if (!resumedState) {
      console.log(
        "No state.json to resume. Falling through to a fresh planning iteration.",
      );
    } else {
      console.log(
        `Loaded state.json: iteration ${resumedState.iteration}, ${resumedState.todos.length} todo(s).`,
      );
    }
  }

  let iteration = resumedState?.iteration ?? 1;
  for (; iteration <= MAX_ITERATIONS; iteration++) {
    if (isAborted()) break;

    const decision = await runIteration(
      iteration,
      baseBranch,
      iteration === (resumedState?.iteration ?? -1) ? resumedState : null,
    );
    if (decision === "stop") break;
    resumedState = null; // only the first iteration of this run resumes
  }

  console.log("\nAll done.");
}

// ----------------------------------------------------------------------------
// Signal / error handlers
// ----------------------------------------------------------------------------

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  if (reason instanceof Error && reason.stack) console.error(reason.stack);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount >= 2) {
    console.error("\nForce exiting.");
    process.exit(130);
  }
  console.error(
    "\nSIGINT — aborting in-flight agents cooperatively (Ctrl-C again to force exit)...",
  );
  abortController.abort(new Error("SIGINT received"));
  // Hard deadline so a stuck agent doesn't block forever.
  setTimeout(() => process.exit(130), 10_000).unref();
});

const entrypoint = isInit ? initMode : main;
entrypoint().catch((err: unknown) => {
  console.error(err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

// keep listAfkIssueBranches reachable for future resume-from-branches mode
void listAfkIssueBranches;
