import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { AgentEvent } from "@agentchan/creative-agent";
import type { AgentMessage, AgentState } from "./agentState.js";
import { EMPTY_AGENT_STATE } from "./agentState.js";

// Map keyed by projectSlug for agentchan's parallel-stream model.
// Reducer is a 1:1 port of pi-agent-core `Agent.processEvents`.

type AgentStateMap = ReadonlyMap<string, AgentState>;

const EMPTY_MAP: AgentStateMap = new Map();

type Action =
  | { type: "HYDRATE"; projectSlug: string; messages: ReadonlyArray<AgentMessage> }
  | { type: "START"; projectSlug: string }
  | { type: "STOP"; projectSlug: string }
  | { type: "AGENT_EVENT"; projectSlug: string; event: AgentEvent }
  | { type: "ERROR"; projectSlug: string; message: string }
  | { type: "CLOSE"; projectSlug: string };

function applyAgentEvent(state: AgentState, ev: AgentEvent): AgentState {
  switch (ev.type) {
    case "agent_start":
      return { ...state, isStreaming: true, streamingMessage: undefined, errorMessage: undefined };
    case "agent_end":
      return { ...state, isStreaming: false, streamingMessage: undefined };
    case "message_start":
    case "message_update":
      if (ev.message.role !== "assistant") return state;
      return { ...state, streamingMessage: ev.message };
    case "message_end":
      return {
        ...state,
        streamingMessage: undefined,
        messages: [...state.messages, ev.message],
      };
    case "tool_execution_start": {
      const pending = new Set(state.pendingToolCalls);
      pending.add(ev.toolCallId);
      return { ...state, pendingToolCalls: pending };
    }
    case "tool_execution_end": {
      const pending = new Set(state.pendingToolCalls);
      pending.delete(ev.toolCallId);
      return { ...state, pendingToolCalls: pending };
    }
    case "turn_end":
      return ev.message.role === "assistant" && ev.message.errorMessage
        ? { ...state, errorMessage: ev.message.errorMessage }
        : state;
    default:
      return state; // tool_execution_update, turn_start
  }
}

function getSlot(map: AgentStateMap, slug: string): AgentState {
  return map.get(slug) ?? EMPTY_AGENT_STATE;
}

function setSlot(map: AgentStateMap, slug: string, slot: AgentState): AgentStateMap {
  const next = new Map(map);
  next.set(slug, slot);
  return next;
}

function reducer(map: AgentStateMap, action: Action): AgentStateMap {
  switch (action.type) {
    case "HYDRATE": {
      // 스트리밍 중엔 events 가 권위. HYDRATE 는 idle 세션 스위치 · branch 전환용.
      if (getSlot(map, action.projectSlug).isStreaming) return map;
      const slot: AgentState = { ...EMPTY_AGENT_STATE, messages: action.messages };
      return setSlot(map, action.projectSlug, slot);
    }
    case "START": {
      const current = getSlot(map, action.projectSlug);
      return setSlot(map, action.projectSlug, {
        ...current,
        isStreaming: true,
        streamingMessage: undefined,
        errorMessage: undefined,
      });
    }
    case "STOP": {
      // 비-agent 루프 작업(예: compact)용 락 해제. 정상 스트림은 agent_end 가 담당.
      const current = getSlot(map, action.projectSlug);
      return setSlot(map, action.projectSlug, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
      });
    }
    case "AGENT_EVENT": {
      const current = getSlot(map, action.projectSlug);
      const next = applyAgentEvent(current, action.event);
      return next === current ? map : setSlot(map, action.projectSlug, next);
    }
    case "ERROR": {
      const current = getSlot(map, action.projectSlug);
      return setSlot(map, action.projectSlug, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
        errorMessage: action.message,
      });
    }
    case "CLOSE": {
      if (!map.has(action.projectSlug)) return map;
      const next = new Map(map);
      next.delete(action.projectSlug);
      return next;
    }
    default:
      return map;
  }
}

// --- Context ---

const StateContext = createContext<AgentStateMap>(EMPTY_MAP);
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY_MAP);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAgentStateMap(): AgentStateMap {
  return use(StateContext);
}

export function useAgentStateDispatch(): Dispatch<Action> {
  return use(DispatchContext);
}

export type AgentStateAction = Action;
