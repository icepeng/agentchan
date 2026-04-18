import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererAction } from "./renderer.types.js";

// --- State ---

export interface RendererActionState {
  pending: RendererAction | null;
}

// --- Dispatch Actions ---

type RendererActionDispatchAction =
  | { type: "SET_ACTION"; action: RendererAction }
  | { type: "CLEAR" };

// --- Reducer ---

function reducer(
  state: RendererActionState,
  action: RendererActionDispatchAction,
): RendererActionState {
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

const initialState: RendererActionState = { pending: null };

const StateContext = createContext<RendererActionState>(initialState);
const DispatchContext = createContext<Dispatch<RendererActionDispatchAction>>(
  () => {},
);

export function RendererActionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useRendererActionState() {
  return use(StateContext);
}

export function useRendererActionDispatch() {
  return use(DispatchContext);
}
