#!/usr/bin/env bun
import { createPhases, realClock } from "./agent.ts";
import { createClaudeRunner } from "./claude-runner.ts";
import { loadConfig, type ConfigOverrides } from "./config.ts";
import { commitsOnBranch, runGit } from "./git.ts";
import { consoleLogger } from "./logger.ts";
import { createPipeline } from "./pipeline.ts";
import { terminateWindowsProcessesHoldingPath } from "./process-cleanup.ts";
import { createStateStore } from "./state.ts";
import { createWorktreeOps } from "./worktree.ts";

function parsePositiveIntegerOption(
  argv: string[],
  names: string[],
): number | undefined {
  for (const name of names) {
    const equalsPrefix = `${name}=`;
    const equalsValue = argv.find((arg) => arg.startsWith(equalsPrefix));
    const index = argv.indexOf(name);
    const value = equalsValue?.slice(equalsPrefix.length) ?? argv[index + 1];

    if (equalsValue === undefined && index === -1) continue;
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} requires a positive integer value`);
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer, got: ${value}`);
    }
    return parsed;
  }
  return undefined;
}

function parseArgs(argv: string[]): {
  resume: boolean;
  overrides: ConfigOverrides;
} {
  return {
    resume: argv.includes("--resume"),
    overrides: {
      maxIterations: parsePositiveIntegerOption(argv, [
        "--iterations",
        "--iteration",
      ]),
    },
  };
}

async function main(): Promise<void> {
  const { resume, overrides } = parseArgs(process.argv.slice(2));
  const config = await loadConfig(overrides);
  const logger = consoleLogger();

  const ac = new AbortController();
  let sigintCount = 0;
  process.on("SIGINT", () => {
    sigintCount++;
    if (sigintCount >= 2) {
      console.error("\nForce exiting.");
      process.exit(130);
    }
    console.error(
      "\nSIGINT — aborting in-flight agents cooperatively (Ctrl-C again to force exit)...",
    );
    ac.abort(new Error("SIGINT received"));
    // Hard deadline so a stuck agent doesn't block forever.
    setTimeout(() => process.exit(130), 10_000).unref();
  });

  const claudeRunner = createClaudeRunner({
    model: config.agentModel,
    stderrTailLimit: config.stderrTailLimit,
  });

  const phases = createPhases({
    runner: claudeRunner,
    config,
    clock: realClock(),
    logger,
  });

  const worktree = createWorktreeOps({
    runGit,
    terminateProcesses: terminateWindowsProcessesHoldingPath,
    config,
  });

  const state = createStateStore(config);

  const pipeline = createPipeline({
    phases,
    git: { runGit, commitsOnBranch },
    worktree,
    state,
    config,
    logger,
    signal: ac.signal,
  });

  await pipeline.run({ resume });
}

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

main().catch((err: unknown) => {
  console.error(err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
