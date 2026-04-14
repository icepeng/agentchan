import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { Conversation, TreeNode, ToolCallState } from "./session.types.js";

// --- State ---

/**
 * Per-project streaming snapshot.
 *
 * Kept in a `streams: Map<projectSlug, StreamSlot>` so background streams
 * (on a project the user has navigated away from) continue to accumulate
 * partial text and tool state, and are surfaced again if the user returns.
 */
export interface StreamSlot {
  conversationId: string;
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
}

export interface SessionState {
  /** Mirror of ProjectState.activeProjectSlug — kept in sync via SWITCH_PROJECT. */
  activeProjectSlug: string | null;

  // Active project's session view:
  conversations: Conversation[];
  activeConversationId: string | null;
  nodes: Map<string, TreeNode>;
  activePath: string[];
  replyToNodeId: string | null;

  // Token usage (accumulated for active project's active session)
  sessionUsage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheCreationTokens: number;
    cost: number;
    contextTokens: number;
  };

  /** Per-project stream state. Only entries for projects with live or recently-ended streams. */
  streams: Map<string /* projectSlug */, StreamSlot>;
}

// --- Actions ---

/**
 * Streaming actions all carry `projectSlug` so we can:
 *   - always update `streams.get(projectSlug)` for background accumulation
 *   - only touch the "active view" state (nodes/activePath/sessionUsage)
 *     when `projectSlug === state.activeProjectSlug`
 */
export type SessionAction =
  // Project / conversation lifecycle
  | { type: "SWITCH_PROJECT"; projectSlug: string | null; conversations: Conversation[] }
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION"; conversation: Conversation; nodes: TreeNode[]; activePath: string[] }
  | { type: "ADD_NODE"; node: TreeNode }
  | { type: "ADD_NODES"; nodes: TreeNode[] }
  | { type: "APPEND_USER_NODE"; projectSlug: string; node: TreeNode }
  | { type: "SET_ACTIVE_PATH"; activePath: string[] }
  | { type: "NEW_CONVERSATION"; conversation: Conversation; nodes?: TreeNode[] }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "SET_REPLY_TO"; nodeId: string | null }
  | {
      type: "STREAM_COMPLETE";
      projectSlug: string;
      nodes: TreeNode[];
      conversation?: Conversation;
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
  // Streaming (all carry projectSlug)
  | { type: "STREAM_START"; projectSlug: string; conversationId: string }
  | { type: "STREAM_TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "STREAM_TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "STREAM_TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "STREAM_TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string }
  | { type: "STREAM_RESET"; projectSlug: string }
  | { type: "STREAM_ERROR"; projectSlug: string; error: string }
  /** Remove a stream slot entirely (e.g. after project delete). */
  | { type: "REMOVE_STREAM"; projectSlug: string };

// --- Helpers ---

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

const emptySlot: StreamSlot = {
  conversationId: "",
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
};

function updateSlot(
  streams: Map<string, StreamSlot>,
  slug: string,
  fn: (slot: StreamSlot) => StreamSlot,
): Map<string, StreamSlot> {
  const next = new Map(streams);
  const current = next.get(slug) ?? { ...emptySlot };
  next.set(slug, fn(current));
  return next;
}

// --- Reducer ---

const emptyUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, cost: 0, contextTokens: 0 };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    // --- Project / conversation lifecycle ---

    case "SWITCH_PROJECT":
      // Replace active view state with the new project's conversations.
      // Preserve streams Map so background streams keep accumulating.
      return {
        ...state,
        activeProjectSlug: action.projectSlug,
        conversations: action.conversations,
        activeConversationId: null,
        nodes: new Map(),
        activePath: [],
        replyToNodeId: null,
        sessionUsage: { ...emptyUsage },
      };

    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };

    case "SET_ACTIVE_CONVERSATION": {
      const nodeMap = buildNodeMap(action.nodes);
      let totalInput = 0, totalOutput = 0, totalCachedInput = 0, totalCacheCreation = 0, totalCost = 0;
      for (const node of action.nodes) {
        const u = node.usage;
        if (u) {
          totalInput += u.inputTokens;
          totalOutput += u.outputTokens;
          totalCachedInput += u.cachedInputTokens ?? 0;
          totalCacheCreation += u.cacheCreationTokens ?? 0;
          totalCost += u.cost ?? 0;
        }
      }
      let contextTokens = 0;
      for (let i = action.activePath.length - 1; i >= 0; i--) {
        const ct = nodeMap.get(action.activePath[i])?.usage?.contextTokens;
        if (ct) { contextTokens = ct; break; }
      }
      const conversations = state.conversations.map((c) =>
        c.id === action.conversation.id ? action.conversation : c,
      );
      return {
        ...state,
        conversations,
        activeConversationId: action.conversation.id,
        nodes: nodeMap,
        activePath: action.activePath,
        replyToNodeId: null,
        sessionUsage: {
          inputTokens: totalInput, outputTokens: totalOutput,
          cachedInputTokens: totalCachedInput, cacheCreationTokens: totalCacheCreation,
          cost: totalCost, contextTokens,
        },
      };
    }

    case "ADD_NODE": {
      const newNodes = new Map(state.nodes);
      insertNode(newNodes, action.node);
      return { ...state, nodes: newNodes };
    }

    case "ADD_NODES": {
      const newNodes = new Map(state.nodes);
      for (const node of action.nodes) insertNode(newNodes, node);
      return { ...state, nodes: newNodes };
    }

    case "APPEND_USER_NODE": {
      // Drop late-arriving user_node events from background (no-longer-active) projects.
      // The server has persisted the node to disk; it'll show up when user navigates back.
      if (action.projectSlug !== state.activeProjectSlug) return state;
      const newNodes = new Map(state.nodes);
      insertNode(newNodes, action.node);
      return {
        ...state,
        nodes: newNodes,
        activePath: [...state.activePath, action.node.id],
      };
    }

    case "SET_ACTIVE_PATH":
      return { ...state, activePath: action.activePath };

    case "NEW_CONVERSATION": {
      const seeded = action.nodes ?? [];
      const nodeMap = buildNodeMap(seeded);
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
        activeConversationId: action.conversation.id,
        nodes: nodeMap,
        activePath: seeded.map((n) => n.id),
        replyToNodeId: null,
        sessionUsage: { ...emptyUsage },
      };
    }

    case "DELETE_CONVERSATION": {
      const remaining = state.conversations.filter((c) => c.id !== action.id);
      const isActive = state.activeConversationId === action.id;
      return {
        ...state,
        conversations: remaining,
        ...(isActive
          ? { activeConversationId: null, nodes: new Map(), activePath: [], replyToNodeId: null }
          : {}),
      };
    }

    case "SET_REPLY_TO":
      return { ...state, replyToNodeId: action.nodeId };

    case "STREAM_COMPLETE": {
      // Always reset the slot.
      const streams = updateSlot(state.streams, action.projectSlug, (slot) => ({
        ...slot,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
      }));

      // Only patch the live tree if the completed stream belongs to the active project.
      const shouldPatchActive = action.projectSlug === state.activeProjectSlug;

      let nodes = state.nodes;
      let activePath = state.activePath;
      let conversations = state.conversations;

      if (shouldPatchActive) {
        const newNodes = new Map(state.nodes);
        for (const node of action.nodes) insertNode(newNodes, node);
        const lastNode = action.nodes[action.nodes.length - 1];
        activePath = lastNode
          ? [...state.activePath, ...action.nodes.map((n) => n.id)]
          : state.activePath;
        nodes = newNodes;
        if (action.conversation) {
          conversations = conversations.map((c) =>
            c.id === action.conversation!.id ? action.conversation! : c,
          );
        }
      }

      return {
        ...state,
        streams,
        nodes,
        activePath,
        replyToNodeId: shouldPatchActive ? null : state.replyToNodeId,
        conversations,
      };
    }

    case "STREAM_USAGE_SUMMARY": {
      // Usage is only relevant for the active project's view.
      if (action.projectSlug !== state.activeProjectSlug) return state;
      return {
        ...state,
        sessionUsage: {
          inputTokens: state.sessionUsage.inputTokens + action.inputTokens,
          outputTokens: state.sessionUsage.outputTokens + action.outputTokens,
          cachedInputTokens: state.sessionUsage.cachedInputTokens + (action.cachedInputTokens ?? 0),
          cacheCreationTokens: state.sessionUsage.cacheCreationTokens + (action.cacheCreationTokens ?? 0),
          cost: state.sessionUsage.cost + (action.cost ?? 0),
          contextTokens: action.contextTokens ?? state.sessionUsage.contextTokens,
        },
      };
    }

    // --- Streaming (per-project slot) ---

    case "STREAM_START":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, () => ({
          conversationId: action.conversationId,
          isStreaming: true,
          streamingText: "",
          streamingToolCalls: [],
          streamError: null,
        })),
      };

    case "STREAM_TEXT_DELTA":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingText: slot.streamingText + action.text,
        })),
      };

    case "STREAM_TOOL_START":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingToolCalls: [
            ...slot.streamingToolCalls,
            { id: action.id, name: action.name, inputJson: "", done: false },
          ],
        })),
      };

    case "STREAM_TOOL_DELTA":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingToolCalls: slot.streamingToolCalls.map((tc) =>
            tc.id === action.id ? { ...tc, inputJson: tc.inputJson + action.inputJson } : tc,
          ),
        })),
      };

    case "STREAM_TOOL_END":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingToolCalls: slot.streamingToolCalls.map((tc) =>
            tc.id === action.id ? { ...tc, done: true } : tc,
          ),
        })),
      };

    case "TOOL_EXEC_START":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingToolCalls: slot.streamingToolCalls.map((tc) =>
            tc.id === action.id ? { ...tc, executing: true, parallel: action.parallel } : tc,
          ),
        })),
      };

    case "TOOL_EXEC_END":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          streamingToolCalls: slot.streamingToolCalls.map((tc) =>
            tc.id === action.id ? { ...tc, executing: false } : tc,
          ),
        })),
      };

    case "STREAM_RESET":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          isStreaming: false,
          streamingText: "",
          streamingToolCalls: [],
          streamError: null,
        })),
      };

    case "STREAM_ERROR":
      return {
        ...state,
        streams: updateSlot(state.streams, action.projectSlug, (slot) => ({
          ...slot,
          isStreaming: false,
          streamingText: "",
          streamingToolCalls: [],
          streamError: action.error,
        })),
      };

    case "REMOVE_STREAM": {
      if (!state.streams.has(action.projectSlug)) return state;
      const next = new Map(state.streams);
      next.delete(action.projectSlug);
      return { ...state, streams: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: SessionState = {
  activeProjectSlug: null,
  conversations: [],
  activeConversationId: null,
  nodes: new Map(),
  activePath: [],
  replyToNodeId: null,
  sessionUsage: { ...emptyUsage },
  streams: new Map(),
};

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

/** Returns the stream slot for a given project, or an empty slot if none. */
export function selectStreamSlot(state: SessionState, projectSlug: string | null): StreamSlot {
  if (!projectSlug) return emptySlot;
  return state.streams.get(projectSlug) ?? emptySlot;
}

/** Hook — the active project's stream slot. Use this instead of reading top-level fields. */
export function useActiveStream(): StreamSlot {
  const state = useSessionState();
  return selectStreamSlot(state, state.activeProjectSlug);
}
