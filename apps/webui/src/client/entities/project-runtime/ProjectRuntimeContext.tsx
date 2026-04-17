import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import type { ToolCallState } from "@/client/entities/session/index.js";

// --- Types ---

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

/**
 * Runtime snapshot of an active stream. `null` when the runtime is idle.
 *
 * `streamUsageDelta` accumulates usage summaries received mid-stream so the UI
 * can tick tokens up before `assistant_nodes` lands in the SWR cache. On
 * STREAM_RESET (per-round end) and STREAM_START the delta is cleared — once
 * nodes are written through to `qk.session(slug, id)`, the canonical
 * usage is derived from the node tree (`useActiveUsage`).
 */
export interface StreamSlot {
  sessionId: string;
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
  streamUsageDelta: SessionUsage;
}

/**
 * Runtime state for a single project: which session is active, the
 * optional reply-to anchor the user has picked, and the in-flight stream slot.
 *
 * Everything server-backed (session tree, usage totals, session list) lives
 * in SWR caches keyed by `(slug, sessionId)`; this reducer holds only the
 * client-only bits (selection, reply-to, live stream deltas).
 */
export interface ProjectRuntime {
  sessionId: string | null;
  replyToNodeId: string | null;
  stream: StreamSlot | null;
}

export interface ProjectRuntimeState {
  runtimes: Map<string /* projectSlug */, ProjectRuntime>;
}

// --- Actions ---

export type ProjectRuntimeAction =
  | {
      type: "SET_ACTIVE_SESSION";
      projectSlug: string;
      sessionId: string | null;
    }
  | { type: "SET_REPLY_TO"; projectSlug: string; nodeId: string | null }
  | { type: "STREAM_START"; projectSlug: string; sessionId: string }
  | { type: "STREAM_TEXT_DELTA"; projectSlug: string; text: string }
  | { type: "STREAM_TOOL_START"; projectSlug: string; id: string; name: string }
  | { type: "STREAM_TOOL_DELTA"; projectSlug: string; id: string; inputJson: string }
  | { type: "STREAM_TOOL_END"; projectSlug: string; id: string }
  | { type: "TOOL_EXEC_START"; projectSlug: string; id: string; parallel: boolean }
  | { type: "TOOL_EXEC_END"; projectSlug: string; id: string }
  | {
      type: "STREAM_USAGE_SUMMARY";
      projectSlug: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      cacheCreationTokens?: number;
      cost?: number;
      contextTokens?: number;
    }
  | { type: "STREAM_RESET"; projectSlug: string }
  | { type: "STREAM_ERROR"; projectSlug: string; error: string }
  | { type: "CLOSE_RUNTIME"; projectSlug: string };

// --- Helpers ---

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
  contextTokens: 0,
};

const EMPTY_STREAM: StreamSlot = {
  sessionId: "",
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
  streamUsageDelta: EMPTY_USAGE,
};

const EMPTY_RUNTIME: ProjectRuntime = {
  sessionId: null,
  replyToNodeId: null,
  stream: null,
};

function updateRuntime(
  state: ProjectRuntimeState,
  slug: string,
  fn: (runtime: ProjectRuntime) => ProjectRuntime,
): ProjectRuntimeState {
  const current = state.runtimes.get(slug) ?? EMPTY_RUNTIME;
  const updated = fn(current);
  if (updated === current) return state;
  const next = new Map(state.runtimes);
  next.set(slug, updated);
  return { runtimes: next };
}

function updateStream(
  state: ProjectRuntimeState,
  slug: string,
  fn: (stream: StreamSlot) => StreamSlot,
): ProjectRuntimeState {
  return updateRuntime(state, slug, (runtime) => ({
    ...runtime,
    stream: fn(runtime.stream ?? EMPTY_STREAM),
  }));
}

// --- Reducer ---

function projectRuntimeReducer(
  state: ProjectRuntimeState,
  action: ProjectRuntimeAction,
): ProjectRuntimeState {
  switch (action.type) {
    case "SET_ACTIVE_SESSION":
      return updateRuntime(state, action.projectSlug, (runtime) => ({
        ...runtime,
        sessionId: action.sessionId,
        replyToNodeId: null,
      }));

    case "SET_REPLY_TO":
      return updateRuntime(state, action.projectSlug, (runtime) => ({
        ...runtime,
        replyToNodeId: action.nodeId,
      }));

    // --- Streaming slot ---

    case "STREAM_START":
      return updateStream(state, action.projectSlug, () => ({
        sessionId: action.sessionId,
        isStreaming: true,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "STREAM_TEXT_DELTA":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingText: stream.streamingText + action.text,
      }));

    case "STREAM_TOOL_START":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: [
          ...stream.streamingToolCalls,
          { id: action.id, name: action.name, inputJson: "", done: false },
        ],
      }));

    case "STREAM_TOOL_DELTA":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, inputJson: tc.inputJson + action.inputJson } : tc,
        ),
      }));

    case "STREAM_TOOL_END":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, done: true } : tc,
        ),
      }));

    case "TOOL_EXEC_START":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: true, parallel: action.parallel } : tc,
        ),
      }));

    case "TOOL_EXEC_END":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamingToolCalls: stream.streamingToolCalls.map((tc) =>
          tc.id === action.id ? { ...tc, executing: false } : tc,
        ),
      }));

    case "STREAM_USAGE_SUMMARY":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        streamUsageDelta: {
          inputTokens: stream.streamUsageDelta.inputTokens + action.inputTokens,
          outputTokens: stream.streamUsageDelta.outputTokens + action.outputTokens,
          cachedInputTokens:
            stream.streamUsageDelta.cachedInputTokens + (action.cachedInputTokens ?? 0),
          cacheCreationTokens:
            stream.streamUsageDelta.cacheCreationTokens + (action.cacheCreationTokens ?? 0),
          cost: stream.streamUsageDelta.cost + (action.cost ?? 0),
          contextTokens: action.contextTokens ?? stream.streamUsageDelta.contextTokens,
        },
      }));

    case "STREAM_RESET":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: null,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "STREAM_ERROR":
      return updateStream(state, action.projectSlug, (stream) => ({
        ...stream,
        isStreaming: false,
        streamingText: "",
        streamingToolCalls: [],
        streamError: action.error,
        streamUsageDelta: EMPTY_USAGE,
      }));

    case "CLOSE_RUNTIME": {
      if (!state.runtimes.has(action.projectSlug)) return state;
      const next = new Map(state.runtimes);
      next.delete(action.projectSlug);
      return { runtimes: next };
    }

    default:
      return state;
  }
}

// --- Context ---

const initialState: ProjectRuntimeState = { runtimes: new Map() };

const ProjectRuntimeStateContext = createContext<ProjectRuntimeState>(initialState);
const ProjectRuntimeDispatchContext = createContext<Dispatch<ProjectRuntimeAction>>(() => {});

export function ProjectRuntimeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectRuntimeReducer, initialState);
  return (
    <ProjectRuntimeStateContext.Provider value={state}>
      <ProjectRuntimeDispatchContext.Provider value={dispatch}>
        {children}
      </ProjectRuntimeDispatchContext.Provider>
    </ProjectRuntimeStateContext.Provider>
  );
}

export function useProjectRuntimeState() {
  return use(ProjectRuntimeStateContext);
}

export function useProjectRuntimeDispatch() {
  return use(ProjectRuntimeDispatchContext);
}

// --- Selectors ---

export function selectRuntime(state: ProjectRuntimeState, projectSlug: string | null): ProjectRuntime {
  if (!projectSlug) return EMPTY_RUNTIME;
  return state.runtimes.get(projectSlug) ?? EMPTY_RUNTIME;
}

export function selectStreamSlot(state: ProjectRuntimeState, projectSlug: string | null): StreamSlot {
  return selectRuntime(state, projectSlug).stream ?? EMPTY_STREAM;
}

export function useActiveRuntime(): ProjectRuntime {
  const { activeProjectSlug } = useProjectState();
  const state = useProjectRuntimeState();
  return selectRuntime(state, activeProjectSlug);
}

export function useActiveStream(): StreamSlot {
  return useActiveRuntime().stream ?? EMPTY_STREAM;
}
