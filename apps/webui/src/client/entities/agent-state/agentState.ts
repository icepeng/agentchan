import type {
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@/client/entities/session/index.js";

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type { AssistantMessage, ToolResultMessage, UserMessage };

/**
 * pi `AgentState`(agent/types.ts:221) UI/렌더러 관심 subset. 이름은 pi와 일치 —
 * `agent.state.messages` 접근 패턴을 그대로 계승한다.
 *
 * `messages`는 persisted selected branch + 아직 persist되지 않은 in-flight
 * `ToolResultMessage`까지 합쳐진 한 흐름이다. 렌더러는 이 배열에서
 * `role === "toolResult" && toolCallId === id`로 tool 결과를 찾는다.
 */
export interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

const EMPTY_PENDING: ReadonlySet<string> = new Set();
const EMPTY_MESSAGES: ReadonlyArray<AgentMessage> = [];

export const EMPTY_AGENT_STATE: AgentState = {
  messages: EMPTY_MESSAGES,
  isStreaming: false,
  pendingToolCalls: EMPTY_PENDING,
};

/**
 * 현재 진행 중인 턴의 assistant content 블록을 한 배열로 복원한다.
 * 마지막 user 메시지 이후의 완료된 assistant 메시지 content +
 * in-flight `streamingMessage.content`를 시간순으로 이어 붙인다.
 *
 * 서버는 턴 전체가 끝나야 `assistant_entries` SSE를 보내므로, 멀티스텝 중간에
 * 완료된 step은 `state.messages`에만 존재한다. `streamingMessage`만 보면
 * 그 구간에서 이전 step의 toolCall이 사라지는 플리커가 생긴다 — 이 병합이
 * 그 공백을 메운다.
 */
export function selectCurrentTurnBlocks(state: AgentState): Array<TextContent | ThinkingContent | ToolCall> {
  const lastUserIdx = state.messages.findLastIndex((m) => m.role === "user");
  const turnMessages = state.messages.slice(lastUserIdx + 1);
  const blocks = turnMessages.flatMap((m) =>
    m.role === "assistant" ? m.content : [],
  );
  if (state.streamingMessage) blocks.push(...state.streamingMessage.content);
  return blocks;
}
