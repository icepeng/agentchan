import {
  createContext,
  use,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererActions } from "@agentchan/renderer-runtime";
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

/**
 * Stable RendererActions object for renderer ctx.actions injection.
 *
 * Memoized intentionally: `actions` is an effect dep in useOutput.refresh,
 * so a fresh identity each render would re-mount the iframe on every parent
 * re-render. The thunk pattern (ref-latest dispatch) keeps the wrapper
 * functional even if React hands useReducer a new dispatch reference.
 */
export function useRendererActions(): RendererActions {
  const dispatch = useRendererActionDispatch();
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  });
  return useMemo<RendererActions>(
    () => ({
      send(text) {
        dispatchRef.current({
          type: "SET_ACTION",
          action: { type: "send", text },
        });
      },
      fill(text) {
        dispatchRef.current({
          type: "SET_ACTION",
          action: { type: "fill", text },
        });
      },
    }),
    [],
  );
}
