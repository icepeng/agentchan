import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

// --- State ---

export interface UIState {
  sidebarOpen: boolean;
  agentPanelOpen: boolean;
  readmeOpen: boolean;
}

// --- Actions ---

export type UIAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_AGENT_PANEL" }
  | { type: "OPEN_README" }
  | { type: "CLOSE_README" };

// --- Reducer ---

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "TOGGLE_AGENT_PANEL":
      return { ...state, agentPanelOpen: !state.agentPanelOpen };
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
