import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AfkTodo, Phases, PlannedIssue } from "./agent.ts";
import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { WorktreeOps } from "./worktree.ts";

export interface PipelineGitDeps {
  runGit: (args: string[], cwd?: string) => Promise<string>;
  commitsOnBranch: (branch: string, base: string) => Promise<string[]>;
}

export interface PipelineDeps {
  phases: Phases;
  git: PipelineGitDeps;
  worktree: WorktreeOps;
  config: Config;
  logger: Logger;
  signal: AbortSignal;
}

export interface Pipeline {
  run(): Promise<void>;
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

function todosFromPlanned(
  planned: PlannedIssue[],
  config: Config,
): AfkTodo[] {
  return planned.map((i) => ({
    number: i.number,
    title: i.title,
    branch: i.branch,
    worktreeDir: `${config.issueDirPrefix}${i.number}`,
    status: "planned",
    commits: 0,
  }));
}

export function createPipeline(deps: PipelineDeps): Pipeline {
  const { phases, git, worktree, config, logger, signal } = deps;

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

  async function progressTodo(
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
    }

    if (todo.status === "impl_done") {
      if (todo.commits === 0) {
        todo.status = "failed";
        todo.error = "implementation produced no commits";
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
    }
  }

  async function executeTodos(
    todos: AfkTodo[],
    baseBranch: string,
  ): Promise<void> {
    const sem = makeSemaphore(config.parallel);
    const settled = await Promise.allSettled(
      todos.map(async (todo) => {
        await sem.acquire();
        try {
          if (signal.aborted) return;
          await progressTodo(todo, baseBranch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`  ✗ #${todo.number} (${todo.branch}): ${msg}`);
          todo.status = "failed";
          todo.error = msg.slice(0, 500);
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
    todos: AfkTodo[],
    iteration: number,
  ): Promise<void> {
    const toMerge = todos.filter(
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
    logger.info("Branches merged.");
  }

  async function batchCleanup(todos: AfkTodo[]): Promise<void> {
    // Only touch worktrees we successfully merged. Failed worktrees are left
    // on disk so the next run can pick the same issue back up and reuse the
    // existing branch+worktree (the planner re-picks open issues, and
    // `worktree.createOrReuse` matches by branch). Avoiding `git worktree
    // remove` on the failure path also sidesteps Windows EBUSY: zombie
    // descendants from a crashed agent can hold node_modules handles, which
    // turns the rm -rf inside `git worktree remove` into a partial failure
    // that desynchronizes git's admin entry from the directory.
    for (const todo of todos) {
      if (todo.status !== "merged") continue;
      const wtPath = join(config.worktreesDir, todo.worktreeDir);
      if (!existsSync(wtPath)) continue;

      try {
        if (await worktree.isDirty(wtPath)) {
          logger.info(`[${todo.branch}] preserved (dirty)`);
        } else {
          await worktree.remove(wtPath);
        }
      } catch (err) {
        logger.error(
          `[${todo.branch}] cleanup failed (leaving on disk): ${err}`,
        );
      }
    }
  }

  async function runIteration(
    iteration: number,
    baseBranch: string,
  ): Promise<"continue" | "stop"> {
    logger.info(`\n=== Iteration ${iteration}/${config.maxIterations} ===\n`);

    const planned = await phases.runPlanner({ iteration, signal });
    if (planned.length === 0) {
      logger.info("No issues to work on. Exiting.");
      return "stop";
    }

    const todos = todosFromPlanned(planned, config);
    logger.info(`${todos.length} issue(s) to work in parallel:`);
    for (const t of todos) {
      logger.info(`  #${t.number}: ${t.title} → ${t.branch}`);
    }

    await executeTodos(todos, baseBranch);
    if (signal.aborted) return "stop";

    await mergeStep(todos, iteration);
    if (signal.aborted) return "stop";

    await batchCleanup(todos);
    return "continue";
  }

  return {
    async run(): Promise<void> {
      const { baseBranch } = await preflight();

      logger.info(`Base branch: ${baseBranch}`);
      logger.info(`Model: ${config.agentModel}`);
      logger.info(
        `Parallel: ${config.parallel} | Max iterations: ${config.maxIterations}`,
      );
      logger.info(
        `Idle timeout: ${Math.round(config.agentIdleTimeoutMs / 1000)}s`,
      );

      for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
        if (signal.aborted) break;
        const decision = await runIteration(iteration, baseBranch);
        if (decision === "stop") break;
      }

      logger.info("\nAll done.");
    },
  };
}
