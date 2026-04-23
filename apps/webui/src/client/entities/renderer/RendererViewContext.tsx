import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererTheme } from "./renderer.types.js";

/** Singleton: only the active project's renderer theme is on screen. */
interface RendererViewState {
  theme: RendererTheme | null;
}

type RendererViewAction =
  | { type: "SET_THEME"; theme: RendererTheme | null }
  | { type: "CLEAR" };

function reducer(state: RendererViewState, action: RendererViewAction): RendererViewState {
  switch (action.type) {
    case "SET_THEME":
      return { theme: action.theme };
    case "CLEAR":
      return { theme: null };
    default:
      return state;
  }
}

const initialState: RendererViewState = { theme: null };

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
