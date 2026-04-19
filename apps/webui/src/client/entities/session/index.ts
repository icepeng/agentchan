export type {
  AssistantContentBlock,
  AssistantMessage,
  ClientMessage,
  ImageContent,
  Message,
  Session,
  TextContent,
  ThinkingContent,
  TokenUsage,
  ToolCallContent,
  ToolResultMessage,
  TreeNode,
  UserMessage,
} from "./session.types.js";

export {
  useSessions,
  useSessionData,
  useSessionMutations,
} from "./useSessions.js";
export type { SessionData } from "./useSessions.js";

export { insertNode, insertNodes, replaceTempNode } from "./tree.utils.js";

export {
  fetchSession, fetchSessions, createSession, deleteSession,
  deleteNode, switchBranch, sendMessage, regenerateResponse, compactSession,
  registerAbortController, clearAbortController, abortProjectStream,
} from "./session.api.js";
export type {
  SSECallbacks,
  AssistantMessageEvent,
  ToolResultContent,
} from "./session.api.js";

export { flattenActivePathToMessages } from "./session.selectors.js";

export {
  SessionSelectionProvider,
  useSessionSelectionState,
  useSessionSelectionDispatch,
  selectSessionSelection,
} from "./SessionSelectionContext.js";
export type { SessionSelection } from "./SessionSelectionContext.js";
export { useActiveSessionSelection } from "./useSessionSelection.js";
