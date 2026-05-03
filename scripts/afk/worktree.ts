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

  return {
    async createOrReuse(branch, worktreeDir, baseBranch) {
      await mkdir(config.worktreesDir, { recursive: true });
      const path = join(config.worktreesDir, worktreeDir);

      if (existsSync(path)) {
        try {
          const head = await runGit(["symbolic-ref", "--short", "HEAD"], path);
          if (head === branch) return path;
        } catch {
          // Not a valid git worktree; fall through to forced re-add.
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
}
