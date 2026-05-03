import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { Config } from "./config.ts";

export type TodoStatus =
  | "planned"
  | "impl_done"
  | "review_done"
  | "merged"
  | "failed";

export interface PlannedIssue {
  number: number;
  title: string;
  branch: string;
}

export interface AfkTodo {
  number: number;
  title: string;
  branch: string;
  worktreeDir: string;
  status: TodoStatus;
  commits: number;
  error?: string;
}

export interface AfkState {
  version: number;
  iteration: number;
  baseBranch: string;
  startedAt: string;
  updatedAt: string;
  todos: AfkTodo[];
}

export interface StateStore {
  load(): Promise<AfkState | null>;
  save(state: AfkState): Promise<void>;
  clear(): Promise<void>;
  createInitial(args: {
    iteration: number;
    baseBranch: string;
    planned: PlannedIssue[];
  }): AfkState;
}

export function createStateStore(config: Config): StateStore {
  return {
    async load(): Promise<AfkState | null> {
      if (!existsSync(config.stateFile)) return null;
      try {
        const raw = await readFile(config.stateFile, "utf8");
        const parsed = JSON.parse(raw) as AfkState;
        if (parsed.version !== config.stateVersion) {
          console.warn(
            `state.json has version ${parsed.version}, expected ${config.stateVersion}. Treating as missing.`,
          );
          return null;
        }
        return parsed;
      } catch (err) {
        console.warn(
          `Failed to read ${config.stateFile}: ${err}. Treating as missing.`,
        );
        return null;
      }
    },

    async save(state: AfkState): Promise<void> {
      state.updatedAt = new Date().toISOString();
      await mkdir(config.afkDir, { recursive: true });
      const tmp = `${config.stateFile}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
      await rename(tmp, config.stateFile);
    },

    async clear(): Promise<void> {
      await rm(config.stateFile, { force: true });
    },

    createInitial({ iteration, baseBranch, planned }): AfkState {
      const todos: AfkTodo[] = planned.map((i) => ({
        number: i.number,
        title: i.title,
        branch: i.branch,
        worktreeDir: `${config.issueDirPrefix}${i.number}`,
        status: "planned",
        commits: 0,
      }));
      const now = new Date().toISOString();
      return {
        version: config.stateVersion,
        iteration,
        baseBranch,
        startedAt: now,
        updatedAt: now,
        todos,
      };
    },
  };
}
