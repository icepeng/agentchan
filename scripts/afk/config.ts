import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runGit } from "./git.ts";

export interface Config {
  // Repo layout
  repoRoot: string;
  gitDir: string;
  gitCommonDir: string;
  isMainCheckout: boolean;
  scriptDir: string;
  worktreesDir: string;
  logsDir: string;

  // Branch / dir naming
  mainBranch: string;
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
  const gitDir = await runGit(["rev-parse", "--git-dir"]);
  const gitCommonDir = await runGit(["rev-parse", "--git-common-dir"]);

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const worktreesDir = join(dirname(repoRoot), `${basename(repoRoot)}-wt`);
  const logsDir = join(repoRoot, ".claude", "automate", "logs");

  const maxIterations =
    overrides.maxIterations ?? Number(process.env.MAX_ITERATIONS ?? 10);
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error(
      `MAX_ITERATIONS must be a positive integer, got: ${maxIterations}`,
    );
  }

  return {
    repoRoot,
    gitDir,
    gitCommonDir,
    isMainCheckout: gitDir === gitCommonDir,
    scriptDir,
    worktreesDir,
    logsDir,

    mainBranch: process.env.MAIN_BRANCH ?? "main",
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
