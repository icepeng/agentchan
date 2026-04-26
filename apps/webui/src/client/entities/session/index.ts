export type {
  AssistantContentBlock,
  AssistantMessage,
  MessageEntry,
  ImageContent,
  Message,
  ProjectSessionInfo,
  ProjectSessionState,
  SessionEntry,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "./session.types.js";

export {
  useSessions,
  useSessionData,
  useSessionMutations,
} from "./useSessions.js";

export {
  fetchSession, fetchSessions, createSession, deleteSession,
  switchBranch, sendMessage, regenerateResponse, compactSession,
  registerAbortController, clearAbortController, abortProjectStream,
} from "./session.api.js";
export type {
  SSECallbacks,
  AgentEvent,
} from "./session.api.js";

export {
  branchToMessages,
  entryMessage,
  isMessageEntry,
  sessionLabel,
} from "./session.selectors.js";

export {
  SessionSelectionProvider,
  useSessionSelectionState,
  useSessionSelectionDispatch,
  selectSessionSelection,
} from "./SessionSelectionContext.js";
export type { SessionSelection } from "./SessionSelectionContext.js";
export { useActiveSessionSelection } from "./useSessionSelection.js";
