import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { SkillMetadata } from "./skill.types.js";

// --- State ---

export interface SkillState {
  skills: SkillMetadata[];
}

// --- Actions ---

export type SkillAction =
  | { type: "SET_SKILLS"; skills: SkillMetadata[] }
  | { type: "CLEAR" };

// --- Reducer ---

function skillReducer(state: SkillState, action: SkillAction): SkillState {
  switch (action.type) {
    case "SET_SKILLS":
      return { ...state, skills: action.skills };

    case "CLEAR":
      return { ...state, skills: [] };

    default:
      return state;
  }
}

// --- Context ---

const initialState: SkillState = {
  skills: [],
};

const SkillStateContext = createContext<SkillState>(initialState);
const SkillDispatchContext = createContext<Dispatch<SkillAction>>(() => {});

export function SkillProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(skillReducer, initialState);
  return (
    <SkillStateContext.Provider value={state}>
      <SkillDispatchContext.Provider value={dispatch}>
        {children}
      </SkillDispatchContext.Provider>
    </SkillStateContext.Provider>
  );
}

export function useSkillState() {
  return use(SkillStateContext);
}

export function useSkillDispatch() {
  return use(SkillDispatchContext);
}
