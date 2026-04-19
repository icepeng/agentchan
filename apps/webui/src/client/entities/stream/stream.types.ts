import type {
  AssistantMessage,
  ToolResultMessage,
} from "@mariozechner/pi-ai";

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

/**
 * Per-project in-flight SSE slot. `fromSession` composes this into `AgentState`
 * by appending `inFlightToolResults` to the persisted activePath messages —
 * tool results that landed mid-stream live here until the turn is persisted as
 * `assistant_nodes`. `streamUsageDelta` is the only field outside the pi
 * subset; it accumulates token counts for the toolbar before the canonical
 * usage rolls into the SWR-cached node tree.
 */
export interface StreamSlot {
  isStreaming: boolean;
  streamingMessage?: AssistantMessage;
  pendingToolCalls: ReadonlySet<string>;
  inFlightToolResults: ReadonlyArray<ToolResultMessage>;
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

const EMPTY_PENDING: ReadonlySet<string> = new Set();
const EMPTY_RESULTS: ReadonlyArray<ToolResultMessage> = [];

export const EMPTY_STREAM: StreamSlot = {
  isStreaming: false,
  pendingToolCalls: EMPTY_PENDING,
  inFlightToolResults: EMPTY_RESULTS,
  streamError: null,
  streamUsageDelta: EMPTY_USAGE,
};
