import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import type { TreeNode, ToolCallState } from "@/client/entities/conversation/index.js";

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
 * Kept as a nested field of `Session` so per-project streams live alongside
 * the rest of that project's runtime state — no separate Map needed.
 */
export interface StreamSlot {
  conversationId: string;
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
}

/**
 * Runtime aggregate for a single project's active conversation.
 *
 * `Conversation`-level metadata (title, list membership) lives in
 * ConversationContext; this holds only the loaded tree view + token
 * accounting + in-flight stream slot.
 *
 * Policy: at most one Session per project (matches the UI guard that allows
 * only one concurrent stream per project). Key by projectSlug in the Map.
 */
export interface Session {
  conversationId: string | null;
  nodes: Map<string, TreeNode>;
  activePath: string[];
  replyToNodeId: string | null;
  usage: SessionUsage;
  stream: StreamSlot | null;
}

/**
 * All runtime state, keyed by project. `activeProjectSlug` is NOT stored here
 * — it lives in ProjectContext (single source of truth). Selectors combine
 * the two contexts to expose "the active session".
 */
export interface SessionState {
  sessions: Map<string /* projectSlug */, Session>;
}

// --- Actions ---

/**
 * Every action carries the `projectSlug` it targets. Reducer applies to that
 * project's session without any "is this the active project?" branching —
 * that's now a UI-level concern handled by selectors.
 */
export type SessionAction =
  | { type: "SET_ACTIVE_CONVERSATION"; projectSlug: string; conversationId: string; nodes: TreeNode[]; activePath: string[] }
  | { type: "NEW_CONVERSATION"; projectSlug: string; conversationId: string; nodes?: TreeNode[] }
  | { type: "DELETE_CONVERSATION"; projectSlug: string; conversationId: string }
  | { type: "ADD_NODE"; projectSlug: string; node: TreeNode }
  | { type: "ADD_NODES"; projectSlug: string; nodes: TreeNode[] }
  | { type: "APPEND_USER_NODE"; projectSlug: string; node: TreeNode }
  | { type: "SET_ACTIVE_PATH"; projectSlug: string; activePath: string[] }
  | { type: "SET_REPLY_TO"; projectSlug: string; nodeId: string | null }
  | {
      type: "STREAM_COMPLETE";
      projectSlug: string;
      nodes: TreeNode[];
    }
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
  | { type: "STREAM_START"; projectSlug: string; conversationId: string }
  | { type: "STREAM_TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "STREAM_TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "STREAM_TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "STREAM_TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string }
  | { type: "STREAM_RESET"; projectSlug: string }
  | { type: "STREAM_ERROR"; projectSlug: string; error: string }
  /** Drop the entire session (e.g. after project delete). */
  | { type: "CLOSE_SESSION"; projectSlug: string };

// --- Helpers ---

const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
  contextTokens: 0,
};

const EMPTY_NODES: Map<string, TreeNode> = new Map();
const EMPTY_PATH: string[] = [];

const EMPTY_STREAM: StreamSlot = {
  conversationId: "",
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
};

const EMPTY_SESSION: Session = {
  conversationId: null,
  nodes: EMPTY_NODES,
  activePath: EMPTY_PATH,
  replyToNodeId: null,
  usage: EMPTY_USAGE,
  stream: null,
};

function buildNodeMap(nodes: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

function insertNode(map: Map<string, TreeNode>, node: TreeNode): void {
  map.set(node.id, node);
  if (node.parentId) {
    const parent = map.get(node.parentId);
    if (parent) {
      const children = parent.children ? [...parent.children] : [];
      if (!children.includes(node.id)) children.push(node.id);
      map.set(parent.id, { ...parent, children, activeChildId: node.id });
    }
  }
}

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

function computeUsageFromNodes(nodes: TreeNode[], activePath: string[], nodeMap: Map<string, TreeNode>): SessionUsage {
  let inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, cacheCreationTokens = 0, cost = 0;
  for (const node of nodes) {
    const u = node.usage;
    if (!u) continue;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    cachedInputTokens += u.cachedInputTokens ?? 0;
    cacheCreationTokens += u.cacheCreationTokens ?? 0;
    cost += u.cost ?? 0;
  }
  let contextTokens = 0;
  for (let i = activePath.length - 1; i >= 0; i--) {
    const ct = nodeMap.get(activePath[i])?.usage?.contextTokens;
    if (ct) { contextTokens = ct; break; }
  }
  return { inputTokens, outputTokens, cachedInputTokens, cacheCreationTokens, cost, contextTokens };
}

// --- Reducer ---

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_ACTIVE_CONVERSATION": {
      const nodeMap = buildNodeMap(action.nodes);
      const usage = computeUsageFromNodes(action.nodes, action.activePath, nodeMap);
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        conversationId: action.conversationId,
        nodes: nodeMap,
        activePath: action.activePath,
        replyToNodeId: null,
        usage,
      }));
    }

    case "NEW_CONVERSATION": {
      const seeded = action.nodes ?? [];
      const nodeMap = buildNodeMap(seeded);
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        conversationId: action.conversationId,
        nodes: nodeMap,
        activePath: seeded.map((n) => n.id),
        replyToNodeId: null,
        usage: EMPTY_USAGE,
      }));
    }

    case "DELETE_CONVERSATION": {
      // Clear the active view if the deleted conversation was active.
      const existing = state.sessions.get(action.projectSlug);
      if (!existing || existing.conversationId !== action.conversationId) return state;
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        conversationId: null,
        nodes: EMPTY_NODES,
        activePath: EMPTY_PATH,
        replyToNodeId: null,
      }));
    }

    case "ADD_NODE": {
      return updateSession(state, action.projectSlug, (session) => {
        const newNodes = new Map(session.nodes);
        insertNode(newNodes, action.node);
        return { ...session, nodes: newNodes };
      });
    }

    case "ADD_NODES": {
      return updateSession(state, action.projectSlug, (session) => {
        const newNodes = new Map(session.nodes);
        for (const node of action.nodes) insertNode(newNodes, node);
        return { ...session, nodes: newNodes };
      });
    }

    case "APPEND_USER_NODE": {
      return updateSession(state, action.projectSlug, (session) => {
        const newNodes = new Map(session.nodes);
        insertNode(newNodes, action.node);
        return {
          ...session,
          nodes: newNodes,
          activePath: [...session.activePath, action.node.id],
        };
      });
    }

    case "SET_ACTIVE_PATH":
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        activePath: action.activePath,
      }));

    case "SET_REPLY_TO":
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        replyToNodeId: action.nodeId,
      }));

    case "STREAM_COMPLETE": {
      return updateSession(state, action.projectSlug, (session) => {
        const newNodes = new Map(session.nodes);
        for (const node of action.nodes) insertNode(newNodes, node);
        const lastNode = action.nodes[action.nodes.length - 1];
        const activePath = lastNode
          ? [...session.activePath, ...action.nodes.map((n) => n.id)]
          : session.activePath;
        return {
          ...session,
          nodes: newNodes,
          activePath,
          replyToNodeId: null,
          stream: { ...(session.stream ?? EMPTY_STREAM), isStreaming: false, streamingText: "", streamingToolCalls: [], streamError: null },
        };
      });
    }

    case "STREAM_USAGE_SUMMARY": {
      return updateSession(state, action.projectSlug, (session) => ({
        ...session,
        usage: {
          inputTokens: session.usage.inputTokens + action.inputTokens,
          outputTokens: session.usage.outputTokens + action.outputTokens,
          cachedInputTokens: session.usage.cachedInputTokens + (action.cachedInputTokens ?? 0),
          cacheCreationTokens: session.usage.cacheCreationTokens + (action.cacheCreationTokens ?? 0),
          cost: session.usage.cost + (action.cost ?? 0),
          contextTokens: action.contextTokens ?? session.usage.contextTokens,
        },
      }));
    }

    // --- Streaming slot ---

    case "STREAM_START":
      return updateStream(state, action.projectSlug, () => ({
        conversationId: action.conversationId,
        isStreaming: true,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
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

    case "STREAM_RESET":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
      }));

    case "STREAM_ERROR":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: action.error,
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

/** Returns the session for a given project (frozen empty session if absent). */
export function selectSession(state: SessionState, projectSlug: string | null): Session {
  if (!projectSlug) return EMPTY_SESSION;
  return state.sessions.get(projectSlug) ?? EMPTY_SESSION;
}

/** Returns the stream slot for a given project (frozen empty slot if idle). */
export function selectStreamSlot(state: SessionState, projectSlug: string | null): StreamSlot {
  return selectSession(state, projectSlug).stream ?? EMPTY_STREAM;
}

/** Hook — the currently active project's session. Reads activeProjectSlug from ProjectContext. */
export function useActiveSession(): Session {
  const { activeProjectSlug } = useProjectState();
  const state = useSessionState();
  return selectSession(state, activeProjectSlug);
}

/** Hook — the currently active project's stream slot. */
export function useActiveStream(): StreamSlot {
  return useActiveSession().stream ?? EMPTY_STREAM;
}
