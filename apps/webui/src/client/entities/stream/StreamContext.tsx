import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { EMPTY_STREAM, type StreamSlot } from "./stream.types.js";

// --- State ---

export interface StreamState {
  slots: Map<string /* projectSlug */, StreamSlot>;
}

// --- Actions ---

export type StreamAction =
  | { type: "START"; projectSlug: string }
  | { type: "TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string; isError: boolean }
  | {
      type: "USAGE_SUMMARY";
      projectSlug: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      cacheCreationTokens?: number;
      cost?: number;
      contextTokens?: number;
    }
  | { type: "RESET"; projectSlug: string }
  | { type: "ERROR"; projectSlug: string; error: string }
  | { type: "CLOSE"; projectSlug: string };

// --- Helpers ---

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

// --- Reducer ---

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
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        toolCalls: slot.toolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, inputJson: tc.inputJson + action.inputJson } : tc,
        ),
      }));

    case "TOOL_END":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        toolCalls: slot.toolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, argsComplete: true } : tc,
        ),
      }));

    case "TOOL_EXEC_START":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        toolCalls: slot.toolCalls.map((tc) =>
          tc.id === action.id
            ? { ...tc, executionStarted: true, parallel: action.parallel }
            : tc,
        ),
      }));

    case "TOOL_EXEC_END":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        toolCalls: slot.toolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, result: { isError: action.isError } } : tc,
        ),
      }));

    case "USAGE_SUMMARY":
      return updateSlot(state, action.projectSlug, (slot) => ({
        ...slot,
        streamUsageDelta: {
          inputTokens: slot.streamUsageDelta.inputTokens + action.inputTokens,
          outputTokens: slot.streamUsageDelta.outputTokens + action.outputTokens,
          cachedInputTokens:
            slot.streamUsageDelta.cachedInputTokens + (action.cachedInputTokens ?? 0),
          cacheCreationTokens:
            slot.streamUsageDelta.cacheCreationTokens + (action.cacheCreationTokens ?? 0),
          cost: slot.streamUsageDelta.cost + (action.cost ?? 0),
          contextTokens: action.contextTokens ?? slot.streamUsageDelta.contextTokens,
        },
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
