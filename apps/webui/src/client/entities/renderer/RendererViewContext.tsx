import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererTheme } from "./renderer.types.js";

/** Singleton: only the active project's renderer output is on screen. */
interface RendererViewState {
  html: string;
  theme: RendererTheme | null;
}

// CLEAR_HTML keeps the last theme to avoid a two-step palette flash on switch;
// CLEAR drops both (used when there's no active project). SET_THEME lets the
// component path update palette without touching the legacy-only html slot.
type RendererViewAction =
  | { type: "SET_OUTPUT"; html: string; theme: RendererTheme | null }
  | { type: "SET_THEME"; theme: RendererTheme | null }
  | { type: "CLEAR_HTML" }
  | { type: "CLEAR" };

function reducer(state: RendererViewState, action: RendererViewAction): RendererViewState {
  switch (action.type) {
    case "SET_OUTPUT":
      return { html: action.html, theme: action.theme };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "CLEAR_HTML":
      return { ...state, html: "" };
    case "CLEAR":
      return { html: "", theme: null };
    default:
      return state;
  }
}

const initialState: RendererViewState = { html: "", theme: null };

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
