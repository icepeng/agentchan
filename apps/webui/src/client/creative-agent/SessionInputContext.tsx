import {
  createContext,
  use,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

export type SessionInputIntent =
  | { type: "submit"; text: string }
  | { type: "fill"; text: string };

interface SessionInputState {
  pending: SessionInputIntent | null;
}

type SessionInputAction =
  | { type: "SET_INTENT"; intent: SessionInputIntent }
  | { type: "CLEAR" };

function reducer(
  state: SessionInputState,
  action: SessionInputAction,
): SessionInputState {
  switch (action.type) {
    case "SET_INTENT":
      return { pending: action.intent };
    case "CLEAR":
      return { pending: null };
  }
}

const initialState: SessionInputState = { pending: null };
const StateContext = createContext<SessionInputState>(initialState);
const DispatchContext = createContext<Dispatch<SessionInputAction>>(() => {});

export function SessionInputProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useSessionInputDispatch() {
  const dispatch = use(DispatchContext);
  return (intent: SessionInputIntent) => {
    dispatch({ type: "SET_INTENT", intent });
  };
}

export function useSessionInputState() {
  return use(StateContext);
}

export function useSessionInputClear() {
  const dispatch = use(DispatchContext);
  return () => dispatch({ type: "CLEAR" });
}
