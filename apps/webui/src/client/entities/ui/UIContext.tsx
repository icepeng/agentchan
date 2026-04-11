import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

// --- PageRoute ---

export type PageRoute =
  | { page: "main" }
  | { page: "templates" }
  | { page: "project-settings"; slug: string; tab?: "general" | "system" | "skills" | "renderer" }
  | { page: "settings"; tab?: "appearance" | "api-keys" };

// --- State ---

export interface UIState {
  sidebarOpen: boolean;
  agentPanelOpen: boolean;
  currentPage: PageRoute;
}

// --- Actions ---

export type UIAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_AGENT_PANEL" }
  | { type: "NAVIGATE"; route: PageRoute };

// --- Reducer ---

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "TOGGLE_AGENT_PANEL":
      return { ...state, agentPanelOpen: !state.agentPanelOpen };
    case "NAVIGATE":
      return { ...state, currentPage: action.route };
    default:
      return state;
  }
}

// --- Context ---

const initialState: UIState = {
  sidebarOpen: true,
  agentPanelOpen: true,
  currentPage: { page: "main" },
};

const UIStateContext = createContext<UIState>(initialState);
const UIDispatchContext = createContext<Dispatch<UIAction>>(() => {});

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  return (
    <UIStateContext.Provider value={state}>
      <UIDispatchContext.Provider value={dispatch}>
        {children}
      </UIDispatchContext.Provider>
    </UIStateContext.Provider>
  );
}

export function useUIState() {
  return use(UIStateContext);
}

export function useUIDispatch() {
  return use(UIDispatchContext);
}
