/**
 * Session surface — Pi-compatible JSONL entry graph.
 *
 * Storage owns id/parentId/timestamp assignment.
 * Branch is derived from leafId at read time, never persisted.
 */

export type {
  SessionEntry,
  SessionEntryBase,
  SessionMessageEntry,
  SessionInfoEntry,
  CompactionEntry,
  CustomMessageEntry,
  ModelChangeEntry,
  SessionHeader,
  SessionInfo,
  AgentchanSessionHeader,
  AgentchanSessionInfo,
  SessionMode,
} from "./types.js";

export {
  branchFromLeaf,
  defaultLeafId,
  siblingsOf,
  buildAgentHistory,
} from "./branch.js";

export {
  buildSessionContext,
  getLatestCompactionEntry,
  parseSessionEntries,
  migrateSessionEntries,
  CURRENT_SESSION_VERSION,
} from "@mariozechner/pi-coding-agent";

export type { SessionContext, FileEntry } from "@mariozechner/pi-coding-agent";

export { readSessionFile, serializeEntry } from "./format.js";

export {
  createSessionStorage,
  type SessionStorage,
  type SessionFileSnapshot,
  type DraftEntry,
  type CreateSessionOpts,
} from "./storage.js";
