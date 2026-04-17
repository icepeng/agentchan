import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RendererTheme } from "./projectTheme.js";

// --- State ---

/**
 * Slim project state — only client-only fields. The project list itself lives
 * in SWR (`useProjects` / `useProjectMutations`) so this reducer no longer
 * tracks `projects[]`, ADD/UPDATE/DELETE actions, or anything cache-shaped.
 */
export interface ProjectState {
  activeProjectSlug: string | null;
  renderedHtml: string;
  rendererTheme: RendererTheme | null;
}

// --- Actions ---

export type ProjectAction =
  | { type: "SET_ACTIVE_PROJECT"; slug: string | null }
  | { type: "SET_RENDER_OUTPUT"; html: string; theme: RendererTheme | null }
  | { type: "CLEAR_RENDER" };

// --- Reducer ---

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_ACTIVE_PROJECT": {
      // rendererTheme은 새 프로젝트의 renderer가 로드되어 SET_RENDER_OUTPUT이
      // 덮어쓸 때까지 유지한다. 즉시 null로 리셋하면 "이전 테마 → 기본 팔레트 →
      // 새 테마"의 두 단계 깜빡임이 발생하기 때문이다.
      return {
        ...state,
        activeProjectSlug: action.slug,
        renderedHtml: "",
      };
    }

    case "SET_RENDER_OUTPUT":
      return { ...state, renderedHtml: action.html, rendererTheme: action.theme };

    case "CLEAR_RENDER":
      // 마지막 프로젝트가 사라진 경우 — 기본 팔레트로 리셋.
      return { activeProjectSlug: null, renderedHtml: "", rendererTheme: null };

    default:
      return state;
  }
}

// --- Context ---

const initialState: ProjectState = {
  activeProjectSlug: null,
  renderedHtml: "",
  rendererTheme: null,
};

const ProjectStateContext = createContext<ProjectState>(initialState);
const ProjectDispatchContext = createContext<Dispatch<ProjectAction>>(() => {});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, initialState);
  return (
    <ProjectStateContext.Provider value={state}>
      <ProjectDispatchContext.Provider value={dispatch}>
        {children}
      </ProjectDispatchContext.Provider>
    </ProjectStateContext.Provider>
  );
}

export function useProjectState() {
  return use(ProjectStateContext);
}

export function useProjectDispatch() {
  return use(ProjectDispatchContext);
}
