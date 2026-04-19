import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type {
  AssistantMessageEvent,
  ImageContent,
  TextContent,
} from "@mariozechner/pi-ai";
import type { TokenUsage } from "@/client/entities/session/index.js";
import {
  EMPTY_STREAM,
  type SessionUsage,
  type StreamSlot,
} from "./stream.types.js";

interface StreamState {
  slots: Map<string /* projectSlug */, StreamSlot>;
}

type StreamAction =
  | { type: "START"; projectSlug: string }
  | { type: "ASSISTANT_EVENT"; projectSlug: string; event: AssistantMessageEvent }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; args: unknown }
  | {
      type: "TOOL_EXEC_END";
      projectSlug: string;
      id: string;
      name: string;
      isError: boolean;
      content: (TextContent | ImageContent)[];
    }
  | { type: "USAGE_SUMMARY"; projectSlug: string; usage: TokenUsage }
  | { type: "RESET"; projectSlug: string }
  | { type: "ERROR"; projectSlug: string; error: string }
  | { type: "CLOSE"; projectSlug: string };

function updateSlot(
  state: StreamState,
  slug: string,
  fn: (slot: StreamSlot) => StreamSlot,
): StreamState {
  const current = state.slots.get(slug) ?? EMPTY_STREAM;
  const updated = fn(current);
  if (updated === current) return state;
  const next = new Map(state.slots);
  next.set(slug, updated);
  return { slots: next };
}

function withPendingAdded(slot: StreamSlot, id: string): StreamSlot {
  if (slot.pendingToolCalls.has(id)) return slot;
  const next = new Set(slot.pendingToolCalls);
  next.add(id);
  return { ...slot, pendingToolCalls: next };
}

function addUsage(base: SessionUsage, delta: TokenUsage): SessionUsage {
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    cachedInputTokens: base.cachedInputTokens + (delta.cachedInputTokens ?? 0),
    cacheCreationTokens: base.cacheCreationTokens + (delta.cacheCreationTokens ?? 0),
    cost: base.cost + (delta.cost ?? 0),
    // contextTokens is a snapshot per round — latest-wins, not summed.
    contextTokens: delta.contextTokens ?? base.contextTokens,
  };
}

function applyAssistantEvent(
  slot: StreamSlot,
  event: AssistantMessageEvent,
): StreamSlot {
  switch (event.type) {
    case "start":
    case "text_start":
    case "text_delta":
    case "text_end":
    case "thinking_start":
    case "thinking_delta":
    case "thinking_end":
    case "toolcall_start":
    case "toolcall_delta":
    case "toolcall_end":
      return { ...slot, streamingMessage: event.partial };
    case "done":
      return { ...slot, streamingMessage: event.message };
    case "error":
      return {
        ...slot,
        streamingMessage: event.error,
        streamError: event.error.errorMessage ?? "Stream error",
      };
    default:
      return slot;
  }
}

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "START":
      return updateSlot(state, action.projectSlug, () => ({
        ...EMPTY_STREAM,
        isStreaming: true,
      }));

    case "ASSISTANT_EVENT":
      return updateSlot(state, action.projectSlug, (slot) =>
        applyAssistantEvent(slot, action.event),
      );

    case "TOOL_EXEC_START":
      return updateSlot(state, action.projectSlug, (slot) =>
        withPendingAdded(slot, action.id),
      );

    case "TOOL_EXEC_END":
      return updateSlot(state, action.projectSlug, (slot) => {
        const nextPending = new Set(slot.pendingToolCalls);
        nextPending.delete(action.id);
        return {
          ...slot,
          pendingToolCalls: nextPending,
          inFlightToolResults: [
            ...slot.inFlightToolResults,
            {
              role: "toolResult",
              toolCallId: action.id,
              toolName: action.name,
              content: action.content,
              isError: action.isError,
              timestamp: Date.now(),
            },
          ],
        };
      });

    case "USAGE_SUMMARY":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        streamUsageDelta: addUsage(slot.streamUsageDelta, action.usage),
      }));

    case "RESET":
      return updateSlot(state, action.projectSlug, () => EMPTY_STREAM);

    case "ERROR":
      return updateSlot(state, action.projectSlug, () => ({
        ...EMPTY_STREAM,
        streamError: action.error,
      }));

    case "CLOSE": {
      if (!state.slots.has(action.projectSlug)) return state;
      const next = new Map(state.slots);
      next.delete(action.projectSlug);
      return { slots: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: StreamState = { slots: new Map() };

const StateContext = createContext<StreamState>(initialState);
const DispatchContext = createContext<Dispatch<StreamAction>>(() => {});

export function StreamProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useStreamState() {
  return use(StateContext);
}

export function useStreamDispatch() {
  return use(DispatchContext);
}

// --- Selectors ---

export function selectStreamSlot(state: StreamState, projectSlug: string | null): StreamSlot {
  if (!projectSlug) return EMPTY_STREAM;
  return state.slots.get(projectSlug) ?? EMPTY_STREAM;
}
