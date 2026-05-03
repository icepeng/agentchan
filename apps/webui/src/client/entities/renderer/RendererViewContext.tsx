import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type {
  RendererBundle,
  RendererSnapshot,
  RendererTheme,
} from "./renderer.types.js";

/** Singleton: only the active project's renderer output is on screen. */
interface RendererViewState {
  bundle: RendererBundle | null;
  snapshot: RendererSnapshot | null;
  theme: RendererTheme | null;
  error: string | null;
}

// Server-driven data store. Host lifecycle (fade/mount/error visibility) is
// owned by the renderer-host presentation machine, not this reducer.
type RendererViewAction =
  | { type: "SET_RENDERER"; bundle: RendererBundle; snapshot: RendererSnapshot }
  | { type: "SET_SNAPSHOT"; snapshot: RendererSnapshot }
  | { type: "SET_THEME"; theme: RendererTheme | null }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR" };

function reducer(state: RendererViewState, action: RendererViewAction): RendererViewState {
  switch (action.type) {
    case "SET_RENDERER":
      return {
        ...state,
        bundle: action.bundle,
        snapshot: action.snapshot,
        error: null,
      };
    case "SET_SNAPSHOT":
      return { ...state, snapshot: action.snapshot, error: null };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "SET_ERROR":
      return {
        ...state,
        bundle: null,
        snapshot: null,
        error: action.error,
      };
    case "CLEAR":
      return { bundle: null, snapshot: null, theme: null, error: null };
    default:
      return state;
  }
}

const initialState: RendererViewState = {
  bundle: null,
  snapshot: null,
  theme: null,
  error: null,
};

const StateContext = createContext<RendererViewState>(initialState);
const DispatchContext = createContext<Dispatch<RendererViewAction>>(() => {});

export function RendererViewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useRendererViewState() {
  return use(StateContext);
}

export function useRendererViewDispatch() {
  return use(DispatchContext);
}
