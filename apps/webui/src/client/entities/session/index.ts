export type {
  AgentMessage,
  AssistantMessage,
  CompactionEntry,
  ImageContent,
  Message,
  SessionEntry,
  SessionMessageEntry,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@agentchan/creative-agent";

export {
  useSessions,
  useSessionData,
  useSessionMutations,
} from "./useSessions.js";

export {
  appendEntriesUnique,
  branchFromLeaf,
} from "./entry.utils.js";

export {
  fetchSession, fetchSessions, createSession, deleteSession,
  sendMessage, regenerateResponse, compactSession,
  registerAbortController, clearAbortController, abortProjectStream,
} from "./session.api.js";
export type {
  SSECallbacks,
  AgentEvent,
} from "./session.api.js";

export {
  SessionSelectionProvider,
  useSessionSelectionState,
  useSessionSelectionDispatch,
  selectSessionSelection,
} from "./SessionSelectionContext.js";
export type { SessionSelection } from "./SessionSelectionContext.js";
export { useActiveSessionSelection } from "./useSessionSelection.js";
