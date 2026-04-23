import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentMessage, AgentState } from "./agentState.js";
import { EMPTY_AGENT_STATE } from "./agentState.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";

// Wire-format events emitted by the server's state SSE channel. See
// `apps/webui/src/server/services/state.service.ts`.
type SnapshotPayload = { state: Omit<AgentState, "pendingToolCalls"> & { pendingToolCalls: string[] } };
type AppendPayload = { message: AgentMessage };
type StreamingPayload = { message: AssistantMessage };
type ToolPendingPayload = { ids: string[] };
type FillInputPayload = { text: string };
type ThemeChangedPayload = { theme: unknown };
type ErrorPayload = { message: string };

export type HostEvent =
  | { type: "fill_input"; text: string }
  | { type: "theme_changed"; theme: unknown };

type HostEventListener = (ev: HostEvent) => void;

type AgentStateMap = ReadonlyMap<string, AgentState>;

const EMPTY_MAP: AgentStateMap = new Map();

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const StateContext = createContext<AgentStateMap>(EMPTY_MAP);
const HostEventContext = createContext<{
  subscribe(listener: HostEventListener): () => void;
}>({
  subscribe: () => () => {},
});

// ---------------------------------------------------------------------------
// Snapshot materialization — pendingToolCalls wire `string[]` -> ReadonlySet
// ---------------------------------------------------------------------------

function materialize(snapshot: SnapshotPayload["state"]): AgentState {
  return {
    messages: snapshot.messages,
    isStreaming: snapshot.isStreaming,
    streamingMessage: snapshot.streamingMessage,
    pendingToolCalls: new Set(snapshot.pendingToolCalls),
    errorMessage: snapshot.errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Provider — opens one EventSource for the active project
// ---------------------------------------------------------------------------

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const { activeProjectSlug } = useProjectSelectionState();
  const [map, setMap] = useState<AgentStateMap>(EMPTY_MAP);
  const listenersRef = useRef<Set<HostEventListener>>(new Set());

  const emitHostEvent = useCallback((ev: HostEvent) => {
    for (const listener of listenersRef.current) {
      try {
        listener(ev);
      } catch (err) {
        console.error("[AgentStateContext] host event listener threw", err);
      }
    }
  }, []);

  const updateSlot = useCallback(
    (slug: string, mutate: (prev: AgentState) => AgentState) => {
      setMap((prev) => {
        const current = prev.get(slug) ?? EMPTY_AGENT_STATE;
        const next = mutate(current);
        if (next === current) return prev;
        const out = new Map(prev);
        out.set(slug, next);
        return out;
      });
    },
    [],
  );

  useEffect(() => {
    if (!activeProjectSlug) return;
    const slug = activeProjectSlug;
    const url = `/api/projects/${encodeURIComponent(slug)}/state/stream`;
    const sse = new EventSource(url);

    sse.addEventListener("snapshot", (e) => {
      const { state } = JSON.parse((e as MessageEvent<string>).data) as SnapshotPayload;
      updateSlot(slug, () => materialize(state));
    });
    sse.addEventListener("append", (e) => {
      const { message } = JSON.parse((e as MessageEvent<string>).data) as AppendPayload;
      updateSlot(slug, (prev) => ({ ...prev, messages: [...prev.messages, message] }));
    });
    sse.addEventListener("streaming", (e) => {
      const { message } = JSON.parse((e as MessageEvent<string>).data) as StreamingPayload;
      updateSlot(slug, (prev) => ({
        ...prev,
        streamingMessage: message,
        isStreaming: true,
        errorMessage: undefined,
      }));
    });
    sse.addEventListener("streaming_clear", () => {
      updateSlot(slug, (prev) => ({
        ...prev,
        streamingMessage: undefined,
        isStreaming: false,
      }));
    });
    sse.addEventListener("tool_pending_set", (e) => {
      const { ids } = JSON.parse((e as MessageEvent<string>).data) as ToolPendingPayload;
      updateSlot(slug, (prev) => ({ ...prev, pendingToolCalls: new Set(ids) }));
    });
    sse.addEventListener("agent_start", () => {
      updateSlot(slug, (prev) => ({
        ...prev,
        isStreaming: true,
        streamingMessage: undefined,
        errorMessage: undefined,
      }));
    });
    sse.addEventListener("error", (e) => {
      const raw = (e as MessageEvent<string>).data;
      if (!raw) return;
      try {
        const { message } = JSON.parse(raw) as ErrorPayload;
        updateSlot(slug, (prev) => ({
          ...prev,
          isStreaming: false,
          streamingMessage: undefined,
          errorMessage: message,
        }));
      } catch {
        /* ignore malformed error payloads from transport-level failures */
      }
    });
    sse.addEventListener("fill_input", (e) => {
      const { text } = JSON.parse((e as MessageEvent<string>).data) as FillInputPayload;
      emitHostEvent({ type: "fill_input", text });
    });
    sse.addEventListener("theme_changed", (e) => {
      const { theme } = JSON.parse((e as MessageEvent<string>).data) as ThemeChangedPayload;
      emitHostEvent({ type: "theme_changed", theme });
    });

    return () => {
      sse.close();
    };
  }, [activeProjectSlug, updateSlot, emitHostEvent]);

  const hostEventApi = useMemo(
    () => ({
      subscribe(listener: HostEventListener) {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [],
  );

  return (
    <StateContext.Provider value={map}>
      <HostEventContext.Provider value={hostEventApi}>
        {children}
      </HostEventContext.Provider>
    </StateContext.Provider>
  );
}

export function useAgentStateMap(): AgentStateMap {
  return use(StateContext);
}

/**
 * Subscribe to host-only SSE events (fill_input, theme_changed). BottomInput
 * consumes `fill_input`; the theme manager consumes `theme_changed`.
 */
export function useHostEventSubscription(
  listener: HostEventListener,
): void {
  const api = use(HostEventContext);
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => {
    return api.subscribe((ev) => ref.current(ev));
  }, [api]);
}
