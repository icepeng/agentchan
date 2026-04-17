import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import type { Conversation } from "./conversation.types.js";

// --- State ---

/**
 * Per-project list of conversation metadata. Pure catalog — no runtime view
 * state (that lives in SessionContext). Holds every project the user has
 * touched this session so other projects' lists don't get dropped on switch.
 */
export interface ConversationState {
  byProject: Map<string /* projectSlug */, Conversation[]>;
}

// --- Actions ---

export type ConversationAction =
  | { type: "SET_FOR_PROJECT"; projectSlug: string; conversations: Conversation[] }
  | { type: "ADD"; projectSlug: string; conversation: Conversation }
  | { type: "UPDATE"; projectSlug: string; conversation: Conversation }
  | { type: "DELETE"; projectSlug: string; conversationId: string }
  | { type: "REMOVE_PROJECT"; projectSlug: string };

// --- Reducer ---

function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "SET_FOR_PROJECT": {
      const next = new Map(state.byProject);
      next.set(action.projectSlug, action.conversations);
      return { byProject: next };
    }

    case "ADD": {
      const existing = state.byProject.get(action.projectSlug) ?? [];
      // Prepend — matches server's updatedAt desc sort and the UI expectation
      // that newly created sessions appear at the left of the tab strip.
      const next = new Map(state.byProject);
      next.set(action.projectSlug, [action.conversation, ...existing]);
      return { byProject: next };
    }

    case "UPDATE": {
      const existing = state.byProject.get(action.projectSlug);
      if (!existing) return state;
      const next = new Map(state.byProject);
      next.set(
        action.projectSlug,
        existing.map((c) => (c.id === action.conversation.id ? action.conversation : c)),
      );
      return { byProject: next };
    }

    case "DELETE": {
      const existing = state.byProject.get(action.projectSlug);
      if (!existing) return state;
      const next = new Map(state.byProject);
      next.set(
        action.projectSlug,
        existing.filter((c) => c.id !== action.conversationId),
      );
      return { byProject: next };
    }

    case "REMOVE_PROJECT": {
      if (!state.byProject.has(action.projectSlug)) return state;
      const next = new Map(state.byProject);
      next.delete(action.projectSlug);
      return { byProject: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: ConversationState = { byProject: new Map() };

const ConversationStateContext = createContext<ConversationState>(initialState);
const ConversationDispatchContext = createContext<Dispatch<ConversationAction>>(() => {});

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  return (
    <ConversationStateContext.Provider value={state}>
      <ConversationDispatchContext.Provider value={dispatch}>
        {children}
      </ConversationDispatchContext.Provider>
    </ConversationStateContext.Provider>
  );
}

export function useConversationState() {
  return use(ConversationStateContext);
}

export function useConversationDispatch() {
  return use(ConversationDispatchContext);
}

// --- Selectors ---

const EMPTY: Conversation[] = [];

export function selectConversations(
  state: ConversationState,
  projectSlug: string | null,
): Conversation[] {
  if (!projectSlug) return EMPTY;
  return state.byProject.get(projectSlug) ?? EMPTY;
}

/** Conversations for a specific project. Empty array if unknown. */
export function useProjectConversations(projectSlug: string | null): Conversation[] {
  const state = useConversationState();
  return selectConversations(state, projectSlug);
}

/** Conversations for the currently active project. */
export function useActiveConversations(): Conversation[] {
  const { activeProjectSlug } = useProjectState();
  return useProjectConversations(activeProjectSlug);
}
