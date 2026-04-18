import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

// --- State ---

/**
 * The active project pointer. The canonical project list lives in SWR
 * (`useProjects` / `useProjectMutations`); this reducer only tracks which slug
 * is currently in focus.
 */
export interface ProjectSelectionState {
  activeProjectSlug: string | null;
}

// --- Actions ---

export type ProjectSelectionAction =
  | { type: "SET_ACTIVE_PROJECT"; slug: string | null };

// --- Reducer ---

function reducer(
  state: ProjectSelectionState,
  action: ProjectSelectionAction,
): ProjectSelectionState {
  switch (action.type) {
    case "SET_ACTIVE_PROJECT":
      return { activeProjectSlug: action.slug };
    default:
      return state;
  }
}

// --- Context ---

const initialState: ProjectSelectionState = { activeProjectSlug: null };

const StateContext = createContext<ProjectSelectionState>(initialState);
const DispatchContext = createContext<Dispatch<ProjectSelectionAction>>(() => {});

export function ProjectSelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useProjectSelectionState() {
  return use(StateContext);
}

export function useProjectSelectionDispatch() {
  return use(DispatchContext);
}
