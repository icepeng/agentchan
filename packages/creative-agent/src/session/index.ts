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
  ThinkingLevelChangeEntry,
  BranchSummaryEntry,
  CustomEntry,
  LabelEntry,
  SessionHeader,
  SessionInfo,
  SessionContext,
  FileEntry,
  AgentchanSessionHeader,
  AgentchanSessionInfo,
  SessionMode,
} from "./types.js";

export { CURRENT_SESSION_VERSION } from "./types.js";

export {
  branchFromLeaf,
  defaultLeafId,
  siblingsOf,
} from "./branch.js";

export { buildSessionContext } from "./context.js";
export { parseSessionEntries, getLatestCompactionEntry } from "./parse.js";

export {
  type CompactionSummaryMessage,
  createCompactionSummaryMessage,
} from "./messages.js";

export { readSessionFile } from "./format.js";

export {
  createSessionStorage,
  type SessionStorage,
  type SessionFileSnapshot,
  type DraftEntry,
  type CreateSessionOpts,
} from "./storage.js";
