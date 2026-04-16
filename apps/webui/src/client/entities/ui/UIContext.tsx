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
  | { page: "settings"; tab?: "appearance" | "api-keys" };

// --- ViewMode ---

export type ViewMode = "chat" | "edit";

// --- State ---

export interface UIState {
  sidebarOpen: boolean;
  agentPanelOpen: boolean;
  currentPage: PageRoute;
  viewMode: ViewMode;
  readmeOpen: boolean;
}

// --- Actions ---

export type UIAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_AGENT_PANEL" }
  | { type: "NAVIGATE"; route: PageRoute }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "OPEN_README" }
  | { type: "CLOSE_README" };

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
    case "OPEN_README":
      return { ...state, readmeOpen: true };
    case "CLOSE_README":
      return { ...state, readmeOpen: false };
    default:
      return state;
  }
}

// --- Context ---

const initialState: UIState = {
  sidebarOpen: true,
  agentPanelOpen: true,
  currentPage: { page: "main" },
  viewMode: "chat",
  readmeOpen: false,
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
