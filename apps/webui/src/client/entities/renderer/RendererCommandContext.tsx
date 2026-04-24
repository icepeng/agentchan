import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererAction } from "./renderer.types.js";

// --- State ---

export interface RendererCommandState {
  pending: RendererAction | null;
}

// --- Dispatch Actions ---

type RendererCommandDispatchAction =
  | { type: "SET_ACTION"; action: RendererAction }
  | { type: "CLEAR" };

// --- Reducer ---

function reducer(
  state: RendererCommandState,
  action: RendererCommandDispatchAction,
): RendererCommandState {
  switch (action.type) {
    case "SET_ACTION":
      return { pending: action.action };
    case "CLEAR":
      return { pending: null };
    default:
      return state;
  }
}

// --- Context ---

const initialState: RendererCommandState = { pending: null };

const StateContext = createContext<RendererCommandState>(initialState);
const DispatchContext = createContext<Dispatch<RendererCommandDispatchAction>>(
  () => {},
);

export function RendererCommandProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useRendererCommandState() {
  return use(StateContext);
}

export function useRendererCommandDispatch() {
  return use(DispatchContext);
}
