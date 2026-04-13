/**
 * Restore files to their pre-modification state using checkpoint snapshots.
 * Failures are logged and skipped — conversation rollback proceeds regardless.
 */

import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import type { CheckpointStore } from "./store.js";
import * as log from "../logger.js";

export async function restoreCheckpoint(
  projectDir: string,
  store: CheckpointStore,
  nodeId: string,
): Promise<string[]> {
  const snapshots = store.get(nodeId);
  if (!snapshots || snapshots.length === 0) return [];

  const results = await Promise.allSettled(
    snapshots.map(async (snap) => {
      const absPath = join(projectDir, snap.path);
      if (snap.action === "created") {
        await unlink(absPath);
      } else if (snap.originalContent !== null) {
        await writeFile(absPath, snap.originalContent, "utf-8");
      }
      return snap.path;
    }),
  );

  const restored: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      restored.push(r.value);
    } else {
      log.warn("checkpoint", `restore failed for ${snapshots[i].path}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }
  return restored;
}
