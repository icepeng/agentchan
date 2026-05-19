import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

// Reply anchor only. Active project + active session live in ViewContext
// (ADR-0009); this slot stores the user's reply target inside the currently
// open session. The session-change effect that clears it on switch lives in
// the consumer (App.tsx) so the reducer stays React-free.

export interface SessionSelectionState {
  replyToEntryId: string | null;
}

export type SessionSelectionAction =
  | { type: "SET_REPLY_TO"; entryId: string | null };

function reducer(
  state: SessionSelectionState,
  action: SessionSelectionAction,
): SessionSelectionState {
  switch (action.type) {
    case "SET_REPLY_TO":
      if (state.replyToEntryId === action.entryId) return state;
      return { replyToEntryId: action.entryId };
    default:
      return state;
  }
}

const initialState: SessionSelectionState = { replyToEntryId: null };

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
