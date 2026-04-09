import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { Conversation, TreeNode, ToolCallState } from "./session.types.js";

// --- State ---

export interface SessionState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  nodes: Map<string, TreeNode>;
  activePath: string[];
  replyToNodeId: string | null;

  // Token usage
  sessionUsage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheCreationTokens: number;
    cost: number;
    contextTokens: number;
  };

  // Streaming (integrated)
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
}

// --- Actions ---

export type SessionAction =
  // Conversation actions
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION"; conversation: Conversation; nodes: TreeNode[]; activePath: string[] }
  | { type: "ADD_NODE"; node: TreeNode }
  | { type: "ADD_NODES"; nodes: TreeNode[] }
  | { type: "SET_ACTIVE_PATH"; activePath: string[] }
  | { type: "NEW_CONVERSATION"; conversation: Conversation; nodes?: TreeNode[] }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "SET_REPLY_TO"; nodeId: string | null }
  | { type: "STREAM_COMPLETE"; nodes: TreeNode[]; conversation?: Conversation }
  | { type: "STREAM_USAGE_SUMMARY"; inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheCreationTokens?: number; cost?: number; contextTokens?: number }
  // Streaming actions
  | { type: "STREAM_START" }
  | { type: "STREAM_TEXT_DELTA"; text: string }
  | { type: "STREAM_TOOL_START"; id: string; name: string }
  | { type: "STREAM_TOOL_DELTA"; id: string; inputJson: string }
  | { type: "STREAM_TOOL_END"; id: string }
  | { type: "TOOL_EXEC_START"; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; id: string }
  | { type: "STREAM_RESET" }
  | { type: "STREAM_ERROR"; error: string }
  // Clear all (project switch)
  | { type: "CLEAR" };

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

// --- Reducer ---

const emptyUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, cost: 0, contextTokens: 0 };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    // --- Conversation ---

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
      const newNodes = new Map(state.nodes);
      for (const node of action.nodes) insertNode(newNodes, node);
      const lastNode = action.nodes[action.nodes.length - 1];
      const newPath = lastNode
        ? [...state.activePath, ...action.nodes.map((n) => n.id)]
        : state.activePath;

      let conversations = state.conversations;
      if (action.conversation) {
        conversations = conversations.map((c) =>
          c.id === action.conversation!.id ? action.conversation! : c,
        );
      }

      return {
        ...state,
        nodes: newNodes,
        activePath: newPath,
        replyToNodeId: null,
        conversations,
      };
    }

    case "STREAM_USAGE_SUMMARY":
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

    // --- Streaming ---

    case "STREAM_START":
      return { ...state, isStreaming: true, streamingText: "", streamingToolCalls: [], streamError: null };

    case "STREAM_TEXT_DELTA":
      return { ...state, streamingText: state.streamingText + action.text };

    case "STREAM_TOOL_START":
      return {
        ...state,
        streamingToolCalls: [
          ...state.streamingToolCalls,
          { id: action.id, name: action.name, inputJson: "", done: false },
        ],
      };

    case "STREAM_TOOL_DELTA":
      return {
        ...state,
        streamingToolCalls: state.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, inputJson: tc.inputJson + action.inputJson } : tc,
        ),
      };

    case "STREAM_TOOL_END":
      return {
        ...state,
        streamingToolCalls: state.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, done: true } : tc,
        ),
      };

    case "TOOL_EXEC_START":
      return {
        ...state,
        streamingToolCalls: state.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: true, parallel: action.parallel } : tc,
        ),
      };

    case "TOOL_EXEC_END":
      return {
        ...state,
        streamingToolCalls: state.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: false } : tc,
        ),
      };

    case "STREAM_RESET":
      return { ...state, isStreaming: false, streamingText: "", streamingToolCalls: [], streamError: null };

    case "STREAM_ERROR":
      return { ...state, isStreaming: false, streamingText: "", streamingToolCalls: [], streamError: action.error };

    // --- Clear all ---

    case "CLEAR":
      return {
        ...state,
        activeConversationId: null,
        conversations: [],
        nodes: new Map(),
        activePath: [],
        replyToNodeId: null,
        sessionUsage: { ...emptyUsage },
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
      };

    default:
      return state;
  }
}

// --- Context ---

const initialState: SessionState = {
  conversations: [],
  activeConversationId: null,
  nodes: new Map(),
  activePath: [],
  replyToNodeId: null,
  sessionUsage: { ...emptyUsage },
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
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
