import {
  applyAgentEvent,
  EMPTY_AGENT_STATE,
  type AgentEvent,
  type AgentMessage,
  type AgentState,
} from "@agentchan/creative-agent/browser";

export type ProjectStreamStatus =
  | { kind: "idle" }
  | { kind: "streaming" }
  | { kind: "error"; message: string };

export type AgentStateAction =
  | { type: "HYDRATE"; projectSlug: string; messages: ReadonlyArray<AgentMessage> }
  | { type: "START"; projectSlug: string }
  | { type: "STOP"; projectSlug: string }
  | { type: "AGENT_EVENT"; projectSlug: string; event: AgentEvent }
  | { type: "ERROR"; projectSlug: string; message: string }
  | { type: "CLOSE"; projectSlug: string };

type AgentStateMap = ReadonlyMap<string, AgentState>;
type Listener = () => void;
type StreamAgentState = AgentState & { readonly settleSeq: number };

const EMPTY_STREAM_AGENT_STATE: StreamAgentState = {
  ...EMPTY_AGENT_STATE,
  settleSeq: 0,
};

export interface AgentStreamStore {
  dispatch(action: AgentStateAction): void;
  subscribe(listener: Listener, slug?: string | null): () => void;
  getStateFor(slug: string | null | undefined): StreamAgentState;
  getStatuses(): ReadonlyMap<string, ProjectStreamStatus>;
}

export function toProjectStreamStatus(state: AgentState): ProjectStreamStatus {
  if (state.errorMessage) return { kind: "error", message: state.errorMessage };
  if (state.isStreaming) return { kind: "streaming" };
  return { kind: "idle" };
}

function toStreamAgentState(state: AgentState): StreamAgentState {
  return "settleSeq" in state
    ? state as StreamAgentState
    : { ...state, settleSeq: 0 };
}

function getSlot(map: AgentStateMap, slug: string): StreamAgentState {
  return map.get(slug) ? toStreamAgentState(map.get(slug)!) : EMPTY_STREAM_AGENT_STATE;
}

function sameStatus(a: ProjectStreamStatus, b: ProjectStreamStatus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== "error") return true;
  return b.kind === "error" && a.message === b.message;
}

function withSettleSeq(current: StreamAgentState, next: AgentState): StreamAgentState {
  const settleSeq = current.isStreaming && !next.isStreaming
    ? current.settleSeq + 1
    : current.settleSeq;
  return "settleSeq" in next && next.settleSeq === settleSeq
    ? next as StreamAgentState
    : { ...next, settleSeq };
}

function reduceSlot(current: StreamAgentState, action: AgentStateAction): StreamAgentState {
  switch (action.type) {
    case "HYDRATE":
      if (current.isStreaming) return current;
      return { ...EMPTY_AGENT_STATE, messages: action.messages, settleSeq: current.settleSeq };
    case "START":
      return {
        ...current,
        isStreaming: true,
        streamingMessage: undefined,
        errorMessage: undefined,
      };
    case "STOP":
      return withSettleSeq(current, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
      });
    case "AGENT_EVENT":
      return withSettleSeq(current, applyAgentEvent(current, action.event));
    case "ERROR":
      return withSettleSeq(current, {
        ...current,
        isStreaming: false,
        streamingMessage: undefined,
        errorMessage: action.message,
      });
    case "CLOSE":
      if (
        !current.isStreaming &&
        !current.streamingMessage &&
        !current.errorMessage &&
        current.messages.length === 0 &&
        current.pendingToolCalls.size === 0
      ) {
        return current;
      }
      return withSettleSeq(current, EMPTY_STREAM_AGENT_STATE);
  }
}

export function createAgentStreamStore(): AgentStreamStore {
  let state: AgentStateMap = new Map();
  let statusesCache: ReadonlyMap<string, ProjectStreamStatus> | null = null;
  const slugListeners = new Map<string, Set<Listener>>();
  const statusListeners = new Set<Listener>();

  const notifySlug = (slug: string) => {
    for (const listener of slugListeners.get(slug) ?? []) listener();
  };

  const notifyStatuses = () => {
    for (const listener of statusListeners) listener();
  };

  const dispatch = (action: AgentStateAction) => {
    const slug = action.projectSlug;
    const current = getSlot(state, slug);
    const beforeStatus = state.has(slug)
      ? toProjectStreamStatus(current)
      : undefined;
    const nextSlot = reduceSlot(current, action);

    if (nextSlot === current) return;

    const next = new Map(state);
    next.set(slug, nextSlot);
    state = next;

    const afterStatus = toProjectStreamStatus(nextSlot);
    const statusChanged =
      !beforeStatus || !sameStatus(beforeStatus, afterStatus);
    if (statusChanged) statusesCache = null;

    notifySlug(slug);
    if (statusChanged) notifyStatuses();
  };

  const subscribe = (listener: Listener, slug?: string | null) => {
    if (!slug) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    }
    let listeners = slugListeners.get(slug);
    if (!listeners) {
      listeners = new Set();
      slugListeners.set(slug, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) slugListeners.delete(slug);
    };
  };

  const getStateFor = (slug: string | null | undefined): StreamAgentState => {
    if (!slug) return EMPTY_STREAM_AGENT_STATE;
    return getSlot(state, slug);
  };

  const getStatuses = () => {
    if (statusesCache) return statusesCache;
    const next = new Map<string, ProjectStreamStatus>();
    for (const [slug, slot] of state) {
      next.set(slug, toProjectStreamStatus(slot));
    }
    statusesCache = next;
    return statusesCache;
  };

  return { dispatch, subscribe, getStateFor, getStatuses };
}
