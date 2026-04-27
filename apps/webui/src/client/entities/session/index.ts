export type {
  AgentchanSessionInfo,
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionInfoEntry,
  SessionMessageEntry,
  SessionMode,
} from "@agentchan/creative-agent";

export type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";

import type { TextContent, ThinkingContent, ToolCall } from "@mariozechner/pi-ai";

/** Content union for assistant messages — text, thinking, or tool call. */
export type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;

export {
  useSessions,
  useSessionData,
  useSessionMutations,
} from "./useSessions.js";
export type { SessionData } from "./useSessions.js";

export { insertEntries, replaceTempEntry } from "./entry.utils.js";

export {
  fetchSession, fetchSessions, createSession, deleteSession,
  renameSession, sendMessage, regenerateResponse, compactSession,
  registerAbortController, clearAbortController, abortProjectStream,
} from "./session.api.js";
export type {
  CompactResponse,
  SessionDetailResponse,
  SSECallbacks,
  AgentEvent,
} from "./session.api.js";

export {
  selectBranch,
  selectSiblings,
  buildSiblingsByEntry,
  selectMessageEntries,
  selectBranchMessages,
  defaultLeafId,
} from "./session.selectors.js";

export {
  SessionSelectionProvider,
  useSessionSelectionState,
  useSessionSelectionDispatch,
  selectSessionSelection,
} from "./SessionSelectionContext.js";
export type { SessionSelection } from "./SessionSelectionContext.js";
export { useActiveSessionSelection } from "./useSessionSelection.js";
