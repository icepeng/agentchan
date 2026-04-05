import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { ProviderInfo, ThinkingLevel } from "./config.types.js";

// --- State ---

export interface ConfigState {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
  providers: ProviderInfo[];
}

// --- Actions ---

export type ConfigAction =
  | { type: "SET_CONFIG"; provider: string; model: string; temperature?: number; maxTokens?: number; contextWindow?: number; thinkingLevel?: ThinkingLevel }
  | { type: "SET_PROVIDERS"; providers: ProviderInfo[] };

// --- Reducer ---

function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
  switch (action.type) {
    case "SET_CONFIG":
      return {
        ...state,
        provider: action.provider,
        model: action.model,
        temperature: action.temperature,
        maxTokens: action.maxTokens,
        contextWindow: action.contextWindow,
        thinkingLevel: action.thinkingLevel,
      };

    case "SET_PROVIDERS":
      return { ...state, providers: action.providers };

    default:
      return state;
  }
}

// --- Context ---

const initialState: ConfigState = {
  provider: "google",
  model: "",
  providers: [],
};

const ConfigStateContext = createContext<ConfigState>(initialState);
const ConfigDispatchContext = createContext<Dispatch<ConfigAction>>(() => {});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(configReducer, initialState);
  return (
    <ConfigStateContext.Provider value={state}>
      <ConfigDispatchContext.Provider value={dispatch}>
        {children}
      </ConfigDispatchContext.Provider>
    </ConfigStateContext.Provider>
  );
}

export function useConfigState() {
  return use(ConfigStateContext);
}

export function useConfigDispatch() {
  return use(ConfigDispatchContext);
}
