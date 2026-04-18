import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { TokenUsage } from "@/client/entities/session/index.js";
import {
  EMPTY_STREAM,
  type SessionUsage,
  type StreamSlot,
  type ToolCallState,
} from "./stream.types.js";

interface StreamState {
  slots: Map<string /* projectSlug */, StreamSlot>;
}

type StreamAction =
  | { type: "START"; projectSlug: string }
  | { type: "TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string; isError: boolean }
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

function patchToolCall(
  slot: StreamSlot,
  id: string,
  patch: Partial<ToolCallState>,
): StreamSlot {
  return {
    ...slot,
    toolCalls: slot.toolCalls.map((tc) => (tc.id === id ? { ...tc, ...patch } : tc)),
  };
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

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "START":
      return updateSlot(state, action.projectSlug, () => ({
        ...EMPTY_STREAM,
        isStreaming: true,
      }));

    case "TEXT_DELTA":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        text: slot.text + action.text,
      }));

    case "TOOL_START":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        toolCalls: [
          ...slot.toolCalls,
          {
            id: action.id,
            name: action.name,
            inputJson: "",
            argsComplete: false,
            executionStarted: false,
          },
        ],
      }));

    case "TOOL_DELTA":
      return updateSlot(state, action.projectSlug, (slot) => {
        const tc = slot.toolCalls.find((t) => t.id === action.id);
        return tc
          ? patchToolCall(slot, action.id, { inputJson: tc.inputJson + action.inputJson })
          : slot;
      });

    case "TOOL_END":
      return updateSlot(state, action.projectSlug, (slot) =>
        patchToolCall(slot, action.id, { argsComplete: true }),
      );

    case "TOOL_EXEC_START":
      return updateSlot(state, action.projectSlug, (slot) =>
        patchToolCall(slot, action.id, { executionStarted: true }),
      );

    case "TOOL_EXEC_END":
      return updateSlot(state, action.projectSlug, (slot) =>
        patchToolCall(slot, action.id, { result: { isError: action.isError } }),
      );

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
