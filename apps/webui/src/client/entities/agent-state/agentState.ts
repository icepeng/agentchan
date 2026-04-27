import type {
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantContentBlock } from "@/client/entities/session/index.js";

export type { AgentMessage };
export type { AssistantMessage, ToolResultMessage, UserMessage };

/**
 * UI/render-facing subset of pi `AgentState` (agent/types.ts:221) — name kept
 * verbatim so `agent.state.messages` access patterns carry over.
 *
 * `messages` blends persisted branch entries (rebuilt to AgentMessage[]) with
 * in-flight `ToolResultMessage` rows. Renderers find tool results by
 * `role === "toolResult" && toolCallId === id`.
 *
 * The union is pi-agent-core's full `AgentMessage` so streaming events like
 * `custom`/`bashExecution` flow through without type narrowing on the way in.
 * Components must guard on `role` before treating an entry as user/assistant.
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
 * Reconstruct the in-flight assistant turn's content blocks. Walks back from
 * the last user message, collects any completed assistant content, then
 * appends the streaming message's blocks. Without the prefix, completed
 * sub-steps of a multi-step turn would flicker out during the next stream.
 */
export function selectCurrentTurnBlocks(state: AgentState): AssistantContentBlock[] {
  const lastUserIdx = state.messages.findLastIndex((m) => m.role === "user");
  const turnMessages = state.messages.slice(lastUserIdx + 1);
  const blocks = turnMessages.flatMap((m) =>
    m.role === "assistant" ? m.content : [],
  );
  if (state.streamingMessage) blocks.push(...state.streamingMessage.content);
  return blocks;
}
