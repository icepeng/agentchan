export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

export interface ToolCallState {
  id: string;
  name: string;
  inputJson: string;
  done: boolean;
  executing?: boolean;
  parallel?: boolean;
}

/**
 * Per-project in-flight SSE slot. `streamUsageDelta` accumulates usage
 * summaries received mid-stream so the UI can tick tokens up before
 * `assistant_nodes` lands in the SWR cache. On RESET (per-round end) and
 * START the delta is cleared — once nodes are written through to
 * `qk.session(slug, id)`, the canonical usage is derived from the node tree.
 */
export interface StreamSlot {
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallState[];
  streamError: string | null;
  streamUsageDelta: SessionUsage;
}

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
  contextTokens: 0,
};

export const EMPTY_STREAM: StreamSlot = {
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamError: null,
  streamUsageDelta: EMPTY_USAGE,
};
