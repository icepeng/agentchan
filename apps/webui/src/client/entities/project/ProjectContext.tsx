import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { Project } from "./project.types.js";

// --- State ---

export interface ProjectState {
  projects: Project[];
  activeProjectSlug: string | null;
  projectActiveSession: Map<string, string>;
  renderedHtml: string;
}

// --- Actions ---

export type ProjectAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_ACTIVE_PROJECT"; slug: string; currentConversationId?: string | null }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "UPDATE_PROJECT"; oldSlug: string; project: Project }
  | { type: "DELETE_PROJECT"; slug: string }
  | { type: "SET_RENDERED_HTML"; html: string };

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
      return {
        ...state,
        activeProjectSlug: action.slug,
        projectActiveSession: newMap,
        renderedHtml: "",
      };
    }

    case "ADD_PROJECT":
      return { ...state, projects: [...state.projects, action.project] };

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
      return {
        ...state,
        projects: remaining,
        ...(wasActive ? { activeProjectSlug: remaining[0]?.slug ?? null, renderedHtml: "" } : {}),
      };
    }

    case "SET_RENDERED_HTML":
      return { ...state, renderedHtml: action.html };

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
