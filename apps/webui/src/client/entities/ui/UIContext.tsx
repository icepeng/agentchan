import {
  createContext,
  use,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";

// --- PageRoute ---

export type PageRoute =
  | { page: "main" }
  | { page: "templates" }
  | { page: "settings"; tab?: "appearance" | "api-keys" };

// --- ViewMode ---

export type ViewMode = "chat" | "edit";

// --- State ---

export interface UIState {
  sidebarOpen: boolean;
  agentPanelOpen: boolean;
  currentPage: PageRoute;
  viewMode: ViewMode;
}

// --- Actions ---

export type UIAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_AGENT_PANEL" }
  | { type: "NAVIGATE"; route: PageRoute }
  | { type: "SET_VIEW_MODE"; mode: ViewMode };

// --- Reducer ---

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "TOGGLE_AGENT_PANEL":
      return { ...state, agentPanelOpen: !state.agentPanelOpen };
    case "NAVIGATE":
      return { ...state, currentPage: action.route };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };
    default:
      return state;
  }
}

// --- Context ---

const savedViewMode = (localStorage.getItem("agentchan-view-mode") as ViewMode | null) ?? "chat";

const initialState: UIState = {
  sidebarOpen: true,
  agentPanelOpen: true,
  currentPage: { page: "main" },
  viewMode: savedViewMode,
};

const UIStateContext = createContext<UIState>(initialState);
const UIDispatchContext = createContext<Dispatch<UIAction>>(() => {});

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  useEffect(() => {
    localStorage.setItem("agentchan-view-mode", state.viewMode);
  }, [state.viewMode]);

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
