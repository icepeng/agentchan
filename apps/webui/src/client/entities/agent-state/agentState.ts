import type {
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type { AssistantMessage, ToolResultMessage, UserMessage };

/**
 * pi `AgentState`(agent/types.ts:221) UI/렌더러 관심 subset. 이름은 pi와 일치 —
 * `agent.state.messages` 접근 패턴을 그대로 계승한다.
 *
 * `messages`는 persisted activePath + 아직 persist되지 않은 in-flight
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
