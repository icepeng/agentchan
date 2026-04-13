/**
 * In-memory checkpoint store — holds file snapshots keyed by assistant node ID.
 *
 * Two maps for O(1) lookup:
 * - files: nodeId → FileSnapshot[] (per-turn snapshots)
 * - byConversation: conversationId → Set<nodeId> (reverse index for listing)
 *
 * Memory-only: cleared on server restart. No disk I/O.
 */

import type { FileSnapshot } from "./types.js";

export interface CheckpointStore {
  /** Save file snapshots for a turn, keyed by the first assistant node ID. */
  save(conversationId: string, nodeId: string, files: FileSnapshot[]): void;
  /** Get file snapshots for a specific node. */
  get(nodeId: string): FileSnapshot[] | undefined;
  /** List all checkpoint node IDs for a conversation. */
  listForConversation(conversationId: string): string[];
  /** Clear all checkpoints for a conversation (e.g., on conversation delete). */
  clearConversation(conversationId: string): void;
}

export function createCheckpointStore(): CheckpointStore {
  const files = new Map<string, FileSnapshot[]>();
  const byConversation = new Map<string, Set<string>>();

  return {
    save(conversationId, nodeId, snapshots) {
      files.set(nodeId, snapshots);
      let set = byConversation.get(conversationId);
      if (!set) {
        set = new Set();
        byConversation.set(conversationId, set);
      }
      set.add(nodeId);
    },

    get(nodeId) {
      return files.get(nodeId);
    },

    listForConversation(conversationId) {
      const set = byConversation.get(conversationId);
      return set ? [...set] : [];
    },

    clearConversation(conversationId) {
      const set = byConversation.get(conversationId);
      if (set) {
        for (const nodeId of set) files.delete(nodeId);
        byConversation.delete(conversationId);
      }
    },
  };
}
