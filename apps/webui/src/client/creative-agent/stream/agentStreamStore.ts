import {
  applyAgentEvent,
  type AgentEvent,
  type AgentMessage,
  type AgentState,
} from "@agentchan/creative-agent/browser";

export type AgentRunStatus =
  | { kind: "idle" }
  | { kind: "streaming" }
  | { kind: "error"; message: string };

export type AgentStreamAction =
  | { type: "HYDRATE"; projectSlug: string; messages: ReadonlyArray<AgentMessage> }
  | { type: "START"; projectSlug: string }
  | { type: "STOP"; projectSlug: string }
  | { type: "AGENT_EVENT"; projectSlug: string; event: AgentEvent }
  | { type: "ERROR"; projectSlug: string; message: string }
  | { type: "CLOSE"; projectSlug: string };

type AgentStateMap = ReadonlyMap<string, AgentStreamSlot>;
type Listener = () => void;
type AgentStreamSlot = {
  readonly state: AgentState;
  readonly settleSeq: number;
};

const IDLE_AGENT_STATE: AgentState = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: new Set(),
};

const IDLE_AGENT_STREAM_SLOT: AgentStreamSlot = {
  state: IDLE_AGENT_STATE,
  settleSeq: 0,
};

export interface AgentStreamStore {
  dispatch(action: AgentStreamAction): void;
  subscribe(listener: Listener, slug?: string | null): () => void;
  getStateFor(slug: string | null | undefined): AgentState;
  getSettleSeq(slug: string | null | undefined): number;
  getStatuses(): ReadonlyMap<string, AgentRunStatus>;
}

export function toAgentRunStatus(state: AgentState): AgentRunStatus {
  if (state.errorMessage) return { kind: "error", message: state.errorMessage };
  if (state.isStreaming) return { kind: "streaming" };
  return { kind: "idle" };
}

function getSlot(map: AgentStateMap, slug: string): AgentStreamSlot {
  return map.get(slug) ?? IDLE_AGENT_STREAM_SLOT;
}

function sameStatus(a: AgentRunStatus, b: AgentRunStatus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== "error") return true;
  return b.kind === "error" && a.message === b.message;
}

function withSettleSeq(current: AgentStreamSlot, next: AgentState): AgentStreamSlot {
  const settleSeq = current.state.isStreaming && !next.isStreaming
    ? current.settleSeq + 1
    : current.settleSeq;
  return next === current.state && settleSeq === current.settleSeq
    ? current
    : { state: next, settleSeq };
}

function reduceSlot(current: AgentStreamSlot, action: AgentStreamAction): AgentStreamSlot {
  switch (action.type) {
    case "HYDRATE":
      if (current.state.isStreaming) return current;
      return {
        state: { ...IDLE_AGENT_STATE, messages: action.messages },
        settleSeq: current.settleSeq,
      };
    case "START":
      return withSettleSeq(current, {
        ...current.state,
        isStreaming: true,
        streamingMessage: undefined,
        errorMessage: undefined,
      });
    case "STOP":
      return withSettleSeq(current, {
        ...current.state,
        isStreaming: false,
        streamingMessage: undefined,
      });
    case "AGENT_EVENT":
      return withSettleSeq(current, applyAgentEvent(current.state, action.event));
    case "ERROR":
      return withSettleSeq(current, {
        ...current.state,
        isStreaming: false,
        streamingMessage: undefined,
        errorMessage: action.message,
      });
    case "CLOSE":
      if (
        !current.state.isStreaming &&
        !current.state.streamingMessage &&
        !current.state.errorMessage &&
        current.state.messages.length === 0 &&
        current.state.pendingToolCalls.size === 0
      ) {
        return current;
      }
      return withSettleSeq(current, IDLE_AGENT_STATE);
  }
}

export function createAgentStreamStore(): AgentStreamStore {
  let state: AgentStateMap = new Map();
  let statusesCache: ReadonlyMap<string, AgentRunStatus> | null = null;
  const slugListeners = new Map<string, Set<Listener>>();
  const statusListeners = new Set<Listener>();

  const notifySlug = (slug: string) => {
    for (const listener of slugListeners.get(slug) ?? []) listener();
  };

  const notifyStatuses = () => {
    for (const listener of statusListeners) listener();
  };

  const dispatch = (action: AgentStreamAction) => {
    const slug = action.projectSlug;
    const current = getSlot(state, slug);
    const beforeStatus = state.has(slug)
      ? toAgentRunStatus(current.state)
      : undefined;
    const nextSlot = reduceSlot(current, action);

    if (nextSlot === current) return;

    const next = new Map(state);
    next.set(slug, nextSlot);
    state = next;

    const afterStatus = toAgentRunStatus(nextSlot.state);
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

  const getStateFor = (slug: string | null | undefined): AgentState => {
    if (!slug) return IDLE_AGENT_STATE;
    return getSlot(state, slug).state;
  };

  const getSettleSeq = (slug: string | null | undefined): number => {
    if (!slug) return 0;
    return getSlot(state, slug).settleSeq;
  };

  const getStatuses = () => {
    if (statusesCache) return statusesCache;
    const next = new Map<string, AgentRunStatus>();
    for (const [slug, slot] of state) {
      next.set(slug, toAgentRunStatus(slot.state));
    }
    statusesCache = next;
    return statusesCache;
  };

  return { dispatch, subscribe, getStateFor, getSettleSeq, getStatuses };
}
