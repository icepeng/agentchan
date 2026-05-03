import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.ts";

export interface WorktreeOpsDeps {
  runGit: (args: string[], cwd?: string) => Promise<string>;
  terminateProcesses: (path: string) => Promise<void>;
  config: Config;
}

export interface WorktreeOps {
  createOrReuse(
    branch: string,
    worktreeDir: string,
    baseBranch: string,
  ): Promise<string>;
  isDirty(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWorktreeOps(deps: WorktreeOpsDeps): WorktreeOps {
  const { runGit, terminateProcesses, config } = deps;

  const ops: WorktreeOps = {
    async createOrReuse(branch, worktreeDir, baseBranch) {
      await mkdir(config.worktreesDir, { recursive: true });
      const path = join(config.worktreesDir, worktreeDir);

      if (existsSync(path)) {
        let head: string | null = null;
        try {
          head = await runGit(["symbolic-ref", "--short", "HEAD"], path);
        } catch {
          // Orphan dir or invalid worktree state — handled below.
        }

        if (head === branch) return path;

        if (head !== null) {
          throw new Error(
            `Worktree at ${path} is on branch "${head}", expected "${branch}". ` +
              `Remove it manually before retrying.`,
          );
        }

        // Orphan dir (path exists, not a registered worktree). Try to remove
        // it; if Windows file locks block deletion, surface a clear error so
        // the user can clean up manually rather than escalating to a process
        // sweep that risks killing user-owned processes.
        try {
          await ops.remove(path);
        } catch (err) {
          throw new Error(
            `Orphan worktree dir at ${path} could not be removed ` +
              `(likely a file lock from a leaked process of a previous AFK run). ` +
              `Close any holders (IDE/terminal pointing into it, or lingering ` +
              `node/bun/claude processes) and delete the directory manually, ` +
              `then retry.\nUnderlying: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await runGit(["worktree", "prune"]);
      }

      try {
        await runGit(["worktree", "add", "-b", branch, path, baseBranch]);
        return path;
      } catch {
        // Branch already exists — attach without -b.
        await runGit(["worktree", "add", path, branch]);
        return path;
      }
    },

    async isDirty(path) {
      const out = await runGit(["status", "--porcelain"], path);
      return out.length > 0;
    },

    async remove(path) {
      let lastError: unknown;

      for (
        let attempt = 1;
        attempt <= config.worktreeRemoveMaxAttempts;
        attempt++
      ) {
        // git removes the admin entry before deleting the dir contents — if a
        // locked file blocks the dir deletion we'd end up with admin gone +
        // dir present, and every subsequent attempt returns "is not a working
        // tree". Release lingering descendant processes first.
        await terminateProcesses(path);

        try {
          await runGit(["worktree", "remove", "--force", path]);
          return;
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);

          // Partial-fail recovery: admin entry gone, dir remains. Re-running
          // git worktree remove cannot succeed; clean leftover dir directly.
          if (/not a working tree/i.test(msg)) {
            if (existsSync(path)) {
              await terminateProcesses(path);
              await rm(path, { recursive: true, force: true, maxRetries: 10 });
            }
            return;
          }

          if (attempt === config.worktreeRemoveMaxAttempts) break;
          await delay(config.worktreeRemoveRetryDelayMs * attempt);
        }
      }

      throw lastError;
    },
  };

  return ops;
}
