/**
 * FileChangeTracker — captures original file content before tool modifications.
 *
 * Used within a single agent turn. The Map key is the relative path, so
 * multiple writes to the same file in one turn only capture the first
 * (original) content — the undo-log pattern.
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { FileSnapshot } from "./types.js";

export interface FileChangeTracker {
  /**
   * Record the current state of a file before it is modified.
   * Call this with the absolute path; the tracker resolves the relative path internally.
   * Skips if the file is already tracked (idempotent per path).
   */
  recordBeforeWrite(absolutePath: string): Promise<void>;
  /** Return all captured snapshots. */
  getSnapshots(): FileSnapshot[];
  /** Whether any file changes were recorded. */
  hasChanges(): boolean;
}

export function createFileChangeTracker(projectDir: string): FileChangeTracker {
  const tracked = new Map<string, FileSnapshot>();

  return {
    async recordBeforeWrite(absolutePath: string) {
      const rel = relative(projectDir, resolve(absolutePath));
      if (tracked.has(rel)) return; // already tracked — keep first snapshot

      try {
        const content = await readFile(absolutePath, "utf-8");
        tracked.set(rel, { path: rel, action: "modified", originalContent: content });
      } catch {
        // File does not exist yet — will be created by the tool
        tracked.set(rel, { path: rel, action: "created", originalContent: null });
      }
    },

    getSnapshots() {
      return [...tracked.values()];
    },

    hasChanges() {
      return tracked.size > 0;
    },
  };
}
