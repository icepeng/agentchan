import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererTheme } from "./renderer.types.js";

/**
 * 활성 프로젝트 렌더러가 `host.setTheme(theme)`로 내려보내는 팔레트.
 * AppShell이 구독해서 전역 `--color-*`를 오버라이드한다.
 */
interface RendererThemeState {
  theme: RendererTheme | null;
}

type RendererThemeAction = { type: "SET_THEME"; theme: RendererTheme | null };

function reducer(state: RendererThemeState, action: RendererThemeAction): RendererThemeState {
  if (action.type !== "SET_THEME") return state;
  // 동일 팔레트 재설정 dispatch에 대한 consumer re-render 차단.
  if (state.theme === action.theme) return state;
  return { theme: action.theme };
}

const initialState: RendererThemeState = { theme: null };

const StateContext = createContext<RendererThemeState>(initialState);
const DispatchContext = createContext<Dispatch<RendererThemeAction>>(() => {});

export function RendererThemeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useRendererThemeState() {
  return use(StateContext);
}

export function useRendererThemeDispatch() {
  return use(DispatchContext);
}
