import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runGit } from "./git.ts";

export interface Config {
  // Repo layout
  repoRoot: string;
  scriptDir: string;
  worktreesDir: string;
  logsDir: string;

  // Branch / dir naming
  issueBranchPrefix: string;
  issueDirPrefix: string;

  // Concurrency / pacing
  parallel: number;
  maxIterations: number;

  // Agent runner
  agentModel: string;
  agentIdleTimeoutMs: number;
  rateLimitMaxRetries: number;
  rateLimitBackoffMs: number;

  // Internal limits
  shellTimeoutMs: number;
  stderrTailLimit: number;
  planBufferLimit: number;
  worktreeRemoveMaxAttempts: number;
  worktreeRemoveRetryDelayMs: number;
}

export interface ConfigOverrides {
  maxIterations?: number;
}

export async function loadConfig(
  overrides: ConfigOverrides = {},
): Promise<Config> {
  const repoRoot = await runGit(["rev-parse", "--show-toplevel"]);
  // Anchor worktreesDir to the main checkout's parent so issue worktrees land
  // in the same place regardless of which worktree AFK was invoked from.
  const worktreeList = await runGit(["worktree", "list", "--porcelain"]);
  const mainWorktree = worktreeList.split("\n")[0]?.replace(/^worktree /, "");
  if (!mainWorktree) {
    throw new Error("Could not determine main worktree path");
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const worktreesDir = join(
    dirname(mainWorktree),
    `${basename(mainWorktree)}-wt`,
  );
  const logsDir = join(repoRoot, ".afk", "logs");

  const maxIterations =
    overrides.maxIterations ?? Number(process.env.MAX_ITERATIONS ?? 10);
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error(
      `MAX_ITERATIONS must be a positive integer, got: ${maxIterations}`,
    );
  }

  return {
    repoRoot,
    scriptDir,
    worktreesDir,
    logsDir,

    issueBranchPrefix: "afk/issue-",
    issueDirPrefix: "issue-",

    parallel: Number(process.env.PARALLEL ?? 3),
    maxIterations,

    agentModel: process.env.AGENT_MODEL ?? "claude-opus-4-7",
    agentIdleTimeoutMs: Number(
      process.env.AGENT_IDLE_TIMEOUT_MS ?? 10 * 60 * 1000,
    ),
    rateLimitMaxRetries: Number(process.env.RATE_LIMIT_MAX_RETRIES ?? 3),
    rateLimitBackoffMs: Number(process.env.RATE_LIMIT_BACKOFF_MS ?? 60_000),

    shellTimeoutMs: 30_000,
    stderrTailLimit: 8_192,
    planBufferLimit: 256 * 1024,
    worktreeRemoveMaxAttempts: 3,
    worktreeRemoveRetryDelayMs: 500,
  };
}
