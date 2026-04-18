import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererTheme } from "./renderer.types.js";

// --- State ---

/**
 * Active project의 렌더러 실행 결과. 화면에 한 번에 하나만 표시되므로 singleton.
 * Theme은 프로젝트 전환 시 새 렌더러가 출력을 낼 때까지 유지 — 두 단계 깜빡임
 * ("이전 테마 → 기본 팔레트 → 새 테마") 방지를 위해 html만 즉시 리셋.
 */
export interface RendererViewState {
  html: string;
  theme: RendererTheme | null;
}

// --- Actions ---

export type RendererViewAction =
  | { type: "SET_OUTPUT"; html: string; theme: RendererTheme | null }
  | { type: "CLEAR_HTML" }
  | { type: "CLEAR" };

// --- Reducer ---

function reducer(state: RendererViewState, action: RendererViewAction): RendererViewState {
  switch (action.type) {
    case "SET_OUTPUT":
      return { html: action.html, theme: action.theme };
    case "CLEAR_HTML":
      return { ...state, html: "" };
    case "CLEAR":
      return { html: "", theme: null };
    default:
      return state;
  }
}

// --- Context ---

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
