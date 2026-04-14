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
      return {
        ...state,
        activeProjectSlug: action.slug,
        projectActiveSession: newMap,
        renderedHtml: "",
        rendererTheme: null,
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
      return {
        ...state,
        projects: remaining,
        ...(wasActive
          ? {
              activeProjectSlug: remaining[0]?.slug ?? null,
              renderedHtml: "",
              rendererTheme: null,
            }
          : {}),
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
