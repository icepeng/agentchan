export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

/**
 * 도구 호출 수명주기. pi-coding-agent `ToolExecutionComponent`의 네이밍을 따름
 * (`argsComplete`, `executionStarted`는 해당 필드에서 그대로 차용):
 *
 * - `argsComplete`     — 입력 JSON 스트리밍 완료 (pi-ai `toolcall_end`)
 * - `executionStarted` — 도구 실행 시작 (pi-agent-core `tool_execution_start`)
 * - `result`           — 도구 실행 완료 시 객체로 채워짐. 완료 시그널은
 *                        `result !== undefined`. pi의 `isPartial` 축은 agentchan
 *                        도구가 partial streaming을 지원하지 않아 생략.
 *
 * 과거 `done: boolean`이 이름과 달리 `argsComplete`만을 의미해 렌더러의 "실행 중"
 * 상태가 실질적으로 dead가 되는 버그가 있었고, 이를 고치면서 phase 표현을
 * 선형 markers 두 개 + 완료 sentinel(`result`)로 재정비했다.
 */
export interface ToolCallState {
  id: string;
  name: string;
  inputJson: string;
  argsComplete: boolean;
  executionStarted: boolean;
  result?: { isError: boolean };
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
  text: string;
  toolCalls: ToolCallState[];
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
  text: "",
  toolCalls: [],
  streamError: null,
  streamUsageDelta: EMPTY_USAGE,
};
