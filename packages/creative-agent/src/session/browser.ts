/**
 * Browser-safe Session graph/projection surface.
 *
 * This subpath intentionally excludes storage, Provider config, agent
 * lifecycle, Skill execution, and LLM replay context.
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
  FileEntry,
  AgentchanSessionHeader,
  AgentchanSessionInfo,
  SessionMode,
} from "./types.js";

export { CURRENT_SESSION_VERSION } from "./types.js";

export {
  branchFromLeaf,
  buildSiblingsByEntry,
  defaultLeafId,
  selectBranch,
  selectBranchMessages,
  selectMessageEntries,
  selectSiblings,
  selectVisibleMessages,
  siblingsOf,
} from "./branch.js";
