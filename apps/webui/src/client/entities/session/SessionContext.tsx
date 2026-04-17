import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import type { ToolCallState } from "@/client/entities/conversation/index.js";

// --- Types ---

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

/**
 * Runtime snapshot of an active stream. `null` when the session is idle.
 *
 * `streamUsageDelta` accumulates usage summaries received mid-stream so the UI
 * can tick tokens up before `assistant_nodes` lands in the SWR cache. On
 * STREAM_RESET (per-round end) and STREAM_START the delta is cleared — once
 * nodes are written through to `qk.conversation(slug, id)`, the canonical
 * usage is derived from the node tree (`useActiveUsage`).
 */
export interface StreamSlot {
  conversationId: string;
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
  streamUsageDelta: SessionUsage;
}

/**
 * Runtime state for a single project: which conversation is active, the
 * optional reply-to anchor the user has picked, and the in-flight stream slot.
 *
 * Everything server-backed (conversation tree, usage totals, conversation
 * list) lives in SWR caches keyed by `(slug, conversationId)`; this reducer
 * holds only the client-only bits (selection, reply-to, live stream deltas).
 */
export interface Session {
  conversationId: string | null;
  replyToNodeId: string | null;
  stream: StreamSlot | null;
}

export interface SessionState {
  sessions: Map<string /* projectSlug */, Session>;
}

// --- Actions ---

export type SessionAction =
  | {
      type: "SET_ACTIVE_CONVERSATION";
      projectSlug: string;
      conversationId: string | null;
    }
  | { type: "SET_REPLY_TO"; projectSlug: string; nodeId: string | null }
  | { type: "STREAM_START"; projectSlug: string; conversationId: string }
  | { type: "STREAM_TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "STREAM_TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "STREAM_TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "STREAM_TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string }
  | {
      type: "STREAM_USAGE_SUMMARY";
      projectSlug: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      cacheCreationTokens?: number;
      cost?: number;
      contextTokens?: number;
    }
  | { type: "STREAM_RESET"; projectSlug: string }
  | { type: "STREAM_ERROR"; projectSlug: string; error: string }
  | { type: "CLOSE_SESSION"; projectSlug: string };

// --- Helpers ---

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
  contextTokens: 0,
};

const EMPTY_STREAM: StreamSlot = {
  conversationId: "",
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
  streamUsageDelta: EMPTY_USAGE,
};

const EMPTY_SESSION: Session = {
  conversationId: null,
  replyToNodeId: null,
  stream: null,
};

function updateSession(
  state: SessionState,
  slug: string,
  fn: (session: Session) => Session,
): SessionState {
  const current = state.sessions.get(slug) ?? EMPTY_SESSION;
  const updated = fn(current);
  if (updated === current) return state;
  const next = new Map(state.sessions);
  next.set(slug, updated);
  return { sessions: next };
}

function updateStream(
  state: SessionState,
  slug: string,
  fn: (stream: StreamSlot) => StreamSlot,
): SessionState {
  return updateSession(state, slug, (session) => ({
    ...session,
    stream: fn(session.stream ?? EMPTY_STREAM),
  }));
}

// --- Reducer ---

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_ACTIVE_CONVERSATION":
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        conversationId: action.conversationId,
        replyToNodeId: null,
      }));

    case "SET_REPLY_TO":
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        replyToNodeId: action.nodeId,
      }));

    // --- Streaming slot ---

    case "STREAM_START":
      return updateStream(state, action.projectSlug, () => ({
        conversationId: action.conversationId,
        isStreaming: true,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "STREAM_TEXT_DELTA":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingText: stream.streamingText + action.text,
      }));

    case "STREAM_TOOL_START":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: [
          ...stream.streamingToolCalls,
          { id: action.id, name: action.name, inputJson: "", done: false },
        ],
      }));

    case "STREAM_TOOL_DELTA":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, inputJson: tc.inputJson + action.inputJson } : tc,
        ),
      }));

    case "STREAM_TOOL_END":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, done: true } : tc,
        ),
      }));

    case "TOOL_EXEC_START":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: true, parallel: action.parallel } : tc,
        ),
      }));

    case "TOOL_EXEC_END":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: false } : tc,
        ),
      }));

    case "STREAM_USAGE_SUMMARY":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamUsageDelta: {
          inputTokens: stream.streamUsageDelta.inputTokens + action.inputTokens,
          outputTokens: stream.streamUsageDelta.outputTokens + action.outputTokens,
          cachedInputTokens:
            stream.streamUsageDelta.cachedInputTokens + (action.cachedInputTokens ?? 0),
          cacheCreationTokens:
            stream.streamUsageDelta.cacheCreationTokens + (action.cacheCreationTokens ?? 0),
          cost: stream.streamUsageDelta.cost + (action.cost ?? 0),
          contextTokens: action.contextTokens ?? stream.streamUsageDelta.contextTokens,
        },
      }));

    case "STREAM_RESET":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "STREAM_ERROR":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: action.error,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "CLOSE_SESSION": {
      if (!state.sessions.has(action.projectSlug)) return state;
      const next = new Map(state.sessions);
      next.delete(action.projectSlug);
      return { sessions: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: SessionState = { sessions: new Map() };

const SessionStateContext = createContext<SessionState>(initialState);
const SessionDispatchContext = createContext<Dispatch<SessionAction>>(() => {});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  return (
    <SessionStateContext.Provider value={state}>
      <SessionDispatchContext.Provider value={dispatch}>
        {children}
      </SessionDispatchContext.Provider>
    </SessionStateContext.Provider>
  );
}

export function useSessionState() {
  return use(SessionStateContext);
}

export function useSessionDispatch() {
  return use(SessionDispatchContext);
}

// --- Selectors ---

export function selectSession(state: SessionState, projectSlug: string | null): Session {
  if (!projectSlug) return EMPTY_SESSION;
  return state.sessions.get(projectSlug) ?? EMPTY_SESSION;
}

export function selectStreamSlot(state: SessionState, projectSlug: string | null): StreamSlot {
  return selectSession(state, projectSlug).stream ?? EMPTY_STREAM;
}

export function useActiveSession(): Session {
  const { activeProjectSlug } = useProjectState();
  const state = useSessionState();
  return selectSession(state, activeProjectSlug);
}

export function useActiveStream(): StreamSlot {
  return useActiveSession().stream ?? EMPTY_STREAM;
}
