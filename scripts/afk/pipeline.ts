import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Phases } from "./agent.ts";
import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { AfkState, AfkTodo, StateStore } from "./state.ts";
import type { WorktreeOps } from "./worktree.ts";

export interface PipelineGitDeps {
  runGit: (args: string[], cwd?: string) => Promise<string>;
  commitsOnBranch: (branch: string, base: string) => Promise<string[]>;
}

export interface PipelineDeps {
  phases: Phases;
  git: PipelineGitDeps;
  worktree: WorktreeOps;
  state: StateStore;
  config: Config;
  logger: Logger;
  signal: AbortSignal;
}

export interface PipelineRunOpts {
  resume: boolean;
}

export interface Pipeline {
  run(opts: PipelineRunOpts): Promise<void>;
}

interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

function makeSemaphore(max: number): Semaphore {
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

export function createPipeline(deps: PipelineDeps): Pipeline {
  const { phases, git, worktree, state, config, logger, signal } = deps;

  async function preflight(): Promise<{ baseBranch: string }> {
    if (!config.isMainCheckout) {
      throw new Error(
        `AFK pipeline must run from the main checkout, not from a worktree.\n` +
          `Current toplevel: ${config.repoRoot}\n` +
          `git-dir:          ${config.gitDir}`,
      );
    }

    const currentBranch = await git.runGit(["symbolic-ref", "--short", "HEAD"]);
    if (currentBranch !== config.mainBranch) {
      throw new Error(
        `Current branch is "${currentBranch}", expected "${config.mainBranch}". AFK pipeline only runs on the main branch.`,
      );
    }

    const dirty = await git.runGit([
      "status",
      "--porcelain",
      "--untracked-files=no",
    ]);
    if (dirty) {
      throw new Error(
        `Main checkout has uncommitted changes. Stash or commit before running — the merge step lands commits directly on ${config.mainBranch}.`,
      );
    }

    const ghProc = Bun.spawn(["gh", "auth", "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await ghProc.exited) !== 0) {
      throw new Error("gh CLI not authenticated. Run `gh auth login`.");
    }

    // Fetch so issue worktrees branch off the freshest origin tip and so the
    // local main can be safely fast-forwarded if it's behind.
    await git.runGit(["fetch", "origin", config.mainBranch]);

    const localTip = await git.runGit(["rev-parse", "HEAD"]);
    const remoteTip = await git.runGit([
      "rev-parse",
      `origin/${config.mainBranch}`,
    ]);
    if (localTip !== remoteTip) {
      const ahead = await git.runGit([
        "rev-list",
        "--count",
        `origin/${config.mainBranch}..HEAD`,
      ]);
      const behind = await git.runGit([
        "rev-list",
        "--count",
        `HEAD..origin/${config.mainBranch}`,
      ]);
      if (Number(ahead) > 0) {
        throw new Error(
          `${config.mainBranch} is ahead of origin/${config.mainBranch} by ${ahead} commit(s). Push or rewind before running — AFK won't merge on top of unpushed local work.`,
        );
      }
      if (Number(behind) > 0) {
        logger.info(
          `Fast-forwarding ${config.mainBranch} by ${behind} commit(s) from origin.`,
        );
        await git.runGit(["merge", "--ff-only", `origin/${config.mainBranch}`]);
      }
    }

    return { baseBranch: config.mainBranch };
  }

  async function planIteration(
    iteration: number,
    baseBranch: string,
  ): Promise<AfkState | null> {
    const planned = await phases.runPlanner({ iteration, signal });
    if (planned.length === 0) return null;
    const initial = state.createInitial({ iteration, baseBranch, planned });
    await state.save(initial);
    return initial;
  }

  async function progressTodo(
    afkState: AfkState,
    todo: AfkTodo,
    baseBranch: string,
  ): Promise<void> {
    const wtPath = join(config.worktreesDir, todo.worktreeDir);

    if (todo.status === "planned") {
      await worktree.createOrReuse(todo.branch, todo.worktreeDir, baseBranch);

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

      await phases.runImplementer({ todo, cwd: wtPath, signal });

      todo.commits = (await git.commitsOnBranch(todo.branch, baseBranch))
        .length;
      todo.status = "impl_done";
      await state.save(afkState);
    }

    if (todo.status === "impl_done") {
      if (todo.commits === 0) {
        todo.status = "failed";
        todo.error = "implementation produced no commits";
        await state.save(afkState);
        return;
      }

      try {
        await phases.runReviewer({
          todo,
          cwd: wtPath,
          baseBranch,
          signal,
        });
      } catch (err) {
        logger.error(
          `[review/#${todo.number}] failed (continuing to merge): ${err}`,
        );
      }

      todo.commits = (await git.commitsOnBranch(todo.branch, baseBranch))
        .length;
      todo.status = "review_done";
      await state.save(afkState);
    }
  }

  async function executeTodos(
    afkState: AfkState,
    baseBranch: string,
  ): Promise<void> {
    const sem = makeSemaphore(config.parallel);
    const settled = await Promise.allSettled(
      afkState.todos.map(async (todo) => {
        if (todo.status === "merged" || todo.status === "failed") return;
        if (todo.status === "review_done") return;
        await sem.acquire();
        try {
          if (signal.aborted) return;
          await progressTodo(afkState, todo, baseBranch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`  ✗ #${todo.number} (${todo.branch}): ${msg}`);
          todo.status = "failed";
          todo.error = msg.slice(0, 500);
          try {
            await state.save(afkState);
          } catch {}
        } finally {
          sem.release();
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        logger.error(`Worker rejected: ${outcome.reason}`);
      }
    }
  }

  async function mergeStep(
    afkState: AfkState,
    iteration: number,
  ): Promise<void> {
    const toMerge = afkState.todos.filter(
      (t) => t.status === "review_done" && t.commits > 0,
    );
    if (toMerge.length === 0) {
      logger.info("No reviewed branches with commits. Skipping merge.");
      return;
    }

    logger.info(`\nMerging ${toMerge.length} branch(es):`);
    for (const t of toMerge) logger.info(`  ${t.branch}`);

    await phases.runMerger({ iteration, todos: toMerge, signal });

    for (const t of toMerge) {
      t.status = "merged";
    }
    await state.save(afkState);
    logger.info("Branches merged.");
  }

  async function batchCleanup(afkState: AfkState): Promise<void> {
    for (const todo of afkState.todos) {
      if (todo.status !== "merged" && todo.status !== "failed") continue;
      const wtPath = join(config.worktreesDir, todo.worktreeDir);
      if (!existsSync(wtPath)) continue;

      try {
        if (await worktree.isDirty(wtPath)) {
          logger.info(`[${todo.branch}] preserved (dirty)`);
        } else {
          await worktree.remove(wtPath);
        }
      } catch (err) {
        logger.error(`[${todo.branch}] cleanup failed: ${err}`);
      }
    }
  }

  async function runIteration(
    iteration: number,
    baseBranch: string,
    resumedState: AfkState | null,
  ): Promise<"continue" | "stop"> {
    logger.info(`\n=== Iteration ${iteration}/${config.maxIterations} ===\n`);

    let afkState: AfkState;
    if (resumedState) {
      logger.info(
        `Resuming iteration ${resumedState.iteration} with ${resumedState.todos.length} todo(s):`,
      );
      for (const t of resumedState.todos) {
        logger.info(`  [${t.status}] #${t.number}: ${t.title} (${t.branch})`);
      }
      afkState = resumedState;
    } else {
      const planned = await planIteration(iteration, baseBranch);
      if (planned === null) {
        logger.info("No issues to work on. Exiting.");
        return "stop";
      }
      afkState = planned;
      logger.info(`${afkState.todos.length} issue(s) to work in parallel:`);
      for (const t of afkState.todos)
        logger.info(`  #${t.number}: ${t.title} → ${t.branch}`);
    }

    await executeTodos(afkState, baseBranch);
    if (signal.aborted) return "stop";

    await mergeStep(afkState, iteration);
    if (signal.aborted) return "stop";

    await batchCleanup(afkState);
    await state.clear();
    return "continue";
  }

  return {
    async run({ resume }: PipelineRunOpts): Promise<void> {
      const { baseBranch } = await preflight();

      logger.info(`Base branch: ${baseBranch}`);
      logger.info(`Model: ${config.agentModel}`);
      logger.info(
        `Parallel: ${config.parallel} | Max iterations: ${config.maxIterations}`,
      );
      logger.info(
        `Idle timeout: ${Math.round(config.agentIdleTimeoutMs / 1000)}s`,
      );

      let resumedState: AfkState | null = null;
      if (resume) {
        logger.info(
          `Resume mode: existing afk/issue-* branches and worktrees will be picked up.`,
        );
        resumedState = await state.load();
        if (!resumedState) {
          logger.info(
            "No state.json to resume. Falling through to a fresh planning iteration.",
          );
        } else {
          logger.info(
            `Loaded state.json: iteration ${resumedState.iteration}, ${resumedState.todos.length} todo(s).`,
          );
        }
      }

      let iteration = resumedState?.iteration ?? 1;
      for (; iteration <= config.maxIterations; iteration++) {
        if (signal.aborted) break;

        const decision = await runIteration(
          iteration,
          baseBranch,
          iteration === (resumedState?.iteration ?? -1) ? resumedState : null,
        );
        if (decision === "stop") break;
        resumedState = null;
      }

      logger.info("\nAll done.");
    },
  };
}
