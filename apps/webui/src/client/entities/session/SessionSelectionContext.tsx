import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

// --- Types ---

/**
 * Per-project session selection — which session tab is open and which entry
 * the user has picked as reply anchor. Coupled because the reply anchor is
 * only meaningful within the currently open session (SET_ACTIVE_SESSION clears it).
 */
export interface SessionSelection {
  openSessionId: string | null;
  replyToEntryId: string | null;
}

export interface SessionSelectionState {
  selectionsByProject: Map<string /* projectSlug */, SessionSelection>;
}

export type SessionSelectionAction =
  | { type: "SET_ACTIVE_SESSION"; projectSlug: string; sessionId: string | null }
  | { type: "SET_REPLY_TO"; projectSlug: string; entryId: string | null }
  | { type: "CLEAR"; projectSlug: string };

// --- Helpers ---

export const EMPTY_SELECTION: SessionSelection = {
  openSessionId: null,
  replyToEntryId: null,
};

function updateSelection(
  state: SessionSelectionState,
  slug: string,
  fn: (sel: SessionSelection) => SessionSelection,
): SessionSelectionState {
  const current = state.selectionsByProject.get(slug) ?? EMPTY_SELECTION;
  const updated = fn(current);
  if (updated === current) return state;
  const next = new Map(state.selectionsByProject);
  next.set(slug, updated);
  return { selectionsByProject: next };
}

// --- Reducer ---

function reducer(
  state: SessionSelectionState,
  action: SessionSelectionAction,
): SessionSelectionState {
  switch (action.type) {
    case "SET_ACTIVE_SESSION":
      return updateSelection(state, action.projectSlug, (sel) =>
        sel.openSessionId === action.sessionId && sel.replyToEntryId === null
          ? sel
          : {
              ...sel,
              openSessionId: action.sessionId,
              // Reply anchor is scoped to the current session — clear on switch.
              replyToEntryId: null,
            },
      );

    case "SET_REPLY_TO":
      return updateSelection(state, action.projectSlug, (sel) =>
        sel.replyToEntryId === action.entryId
          ? sel
          : { ...sel, replyToEntryId: action.entryId },
      );

    case "CLEAR": {
      if (!state.selectionsByProject.has(action.projectSlug)) return state;
      const next = new Map(state.selectionsByProject);
      next.delete(action.projectSlug);
      return { selectionsByProject: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: SessionSelectionState = {
  selectionsByProject: new Map(),
};

const StateContext = createContext<SessionSelectionState>(initialState);
const DispatchContext = createContext<Dispatch<SessionSelectionAction>>(() => {});

export function SessionSelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useSessionSelectionState() {
  return use(StateContext);
}

export function useSessionSelectionDispatch() {
  return use(DispatchContext);
}

// --- Selectors ---

export function selectSessionSelection(
  state: SessionSelectionState,
  projectSlug: string | null,
): SessionSelection {
  if (!projectSlug) return EMPTY_SELECTION;
  return state.selectionsByProject.get(projectSlug) ?? EMPTY_SELECTION;
}
