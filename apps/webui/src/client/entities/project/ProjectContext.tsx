import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { Project } from "./project.types.js";
import type { RendererTheme } from "./projectTheme.js";

// --- State ---

export interface ProjectState {
  projects: Project[];
  activeProjectSlug: string | null;
  projectActiveSession: Map<string, string>;
  renderedHtml: string;
  rendererTheme: RendererTheme | null;
}

// --- Actions ---

export type ProjectAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_ACTIVE_PROJECT"; slug: string; currentConversationId?: string | null }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "UPDATE_PROJECT"; oldSlug: string; project: Project }
  | { type: "DELETE_PROJECT"; slug: string }
  | { type: "SET_RENDER_OUTPUT"; html: string; theme: RendererTheme | null };

// --- Reducer ---

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_PROJECTS":
      return { ...state, projects: action.projects };

    case "SET_ACTIVE_PROJECT": {
      const newMap = new Map(state.projectActiveSession);
      if (state.activeProjectSlug && action.currentConversationId) {
        newMap.set(state.activeProjectSlug, action.currentConversationId);
      }
      // rendererTheme은 새 프로젝트의 renderer가 로드되어 SET_RENDER_OUTPUT이
      // 덮어쓸 때까지 유지한다. 즉시 null로 리셋하면 "이전 테마 → 기본 팔레트 →
      // 새 테마"의 두 단계 깜빡임이 발생하기 때문이다.
      return {
        ...state,
        activeProjectSlug: action.slug,
        projectActiveSession: newMap,
        renderedHtml: "",
      };
    }

    case "ADD_PROJECT":
      // Prepend so the newly created project appears at the top, matching the
      // server's `updatedAt desc` sort and the sidebar's "New project" trigger
      // sitting above the list — otherwise the fresh project would pop in at
      // the bottom and only jump to the top on the next reload.
      return { ...state, projects: [action.project, ...state.projects] };

    case "UPDATE_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.slug === action.oldSlug ? action.project : p,
        ),
        activeProjectSlug:
          state.activeProjectSlug === action.oldSlug
            ? action.project.slug
            : state.activeProjectSlug,
      };

    case "DELETE_PROJECT": {
      const remaining = state.projects.filter((p) => p.slug !== action.slug);
      const wasActive = state.activeProjectSlug === action.slug;
      if (!wasActive) {
        return { ...state, projects: remaining };
      }
      const nextSlug = remaining[0]?.slug ?? null;
      if (nextSlug === null) {
        // 프로젝트가 하나도 남지 않으면 "프로젝트 없음" 상태이므로 기본 팔레트로 리셋.
        return {
          ...state,
          projects: remaining,
          activeProjectSlug: null,
          renderedHtml: "",
          rendererTheme: null,
        };
      }
      // 다음 active의 renderer가 로드될 때까지 rendererTheme은 유지 —
      // SET_ACTIVE_PROJECT와 동일한 flash-free 전환 원칙.
      return {
        ...state,
        projects: remaining,
        activeProjectSlug: nextSlug,
        renderedHtml: "",
      };
    }

    case "SET_RENDER_OUTPUT":
      return { ...state, renderedHtml: action.html, rendererTheme: action.theme };

    default:
      return state;
  }
}

// --- Context ---

const initialState: ProjectState = {
  projects: [],
  activeProjectSlug: null,
  projectActiveSession: new Map(),
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
