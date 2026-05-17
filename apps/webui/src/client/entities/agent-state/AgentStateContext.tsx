import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { applyAgentEvent, type AgentEvent } from "@agentchan/creative-agent/browser";
import type { AgentMessage, AgentState } from "./agentState.js";
import { EMPTY_AGENT_STATE } from "./agentState.js";

// Map keyed by projectSlug for agentchan's parallel-stream model.
// Reducer (`applyAgentEvent`) lives in `@agentchan/creative-agent/browser`
// so host and iframe-side adapter share a single canonical source.

type StreamAgentState = AgentState & { readonly settleSeq: number };
type AgentStateMap = ReadonlyMap<string, StreamAgentState>;

const EMPTY_STREAM_AGENT_STATE: StreamAgentState = {
  ...EMPTY_AGENT_STATE,
  settleSeq: 0,
};

const EMPTY_MAP: AgentStateMap = new Map();

type Action =
  | { type: "HYDRATE"; projectSlug: string; messages: ReadonlyArray<AgentMessage> }
  | { type: "START"; projectSlug: string }
  | { type: "STOP"; projectSlug: string }
  | { type: "AGENT_EVENT"; projectSlug: string; event: AgentEvent }
  | { type: "ERROR"; projectSlug: string; message: string }
  | { type: "CLOSE"; projectSlug: string };

function getSlot(map: AgentStateMap, slug: string): StreamAgentState {
  return map.get(slug) ?? EMPTY_STREAM_AGENT_STATE;
}

function setSlot(map: AgentStateMap, slug: string, slot: StreamAgentState): AgentStateMap {
  const next = new Map(map);
  next.set(slug, slot);
  return next;
}

function withSettleSeq(current: StreamAgentState, next: AgentState): StreamAgentState {
  const settleSeq = current.isStreaming && !next.isStreaming
    ? current.settleSeq + 1
    : current.settleSeq;
  return "settleSeq" in next && next.settleSeq === settleSeq
    ? next as StreamAgentState
    : { ...next, settleSeq };
}

function reducer(map: AgentStateMap, action: Action): AgentStateMap {
  switch (action.type) {
    case "HYDRATE": {
      // 스트리밍 중엔 events 가 권위. HYDRATE 는 idle 세션 스위치 · branch 전환용.
      if (getSlot(map, action.projectSlug).isStreaming) return map;
      const current = getSlot(map, action.projectSlug);
      const slot: StreamAgentState = {
        ...EMPTY_AGENT_STATE,
        messages: action.messages,
        settleSeq: current.settleSeq,
      };
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
      return setSlot(map, action.projectSlug, withSettleSeq(current, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
      }));
    }
    case "AGENT_EVENT": {
      const current = getSlot(map, action.projectSlug);
      const next = withSettleSeq(current, applyAgentEvent(current, action.event));
      return next === current ? map : setSlot(map, action.projectSlug, next);
    }
    case "ERROR": {
      const current = getSlot(map, action.projectSlug);
      return setSlot(map, action.projectSlug, withSettleSeq(current, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
        errorMessage: action.message,
      }));
    }
    case "CLOSE": {
      const current = getSlot(map, action.projectSlug);
      if (
        !current.isStreaming &&
        !current.streamingMessage &&
        !current.errorMessage &&
        current.messages.length === 0 &&
        current.pendingToolCalls.size === 0
      ) {
        return map;
      }
      return setSlot(
        map,
        action.projectSlug,
        withSettleSeq(current, EMPTY_STREAM_AGENT_STATE),
      );
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
