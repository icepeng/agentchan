import type {
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type {
  AgentMessage,
  AgentState,
} from "@agentchan/creative-agent/browser";
import type { AssistantContentBlock } from "@/client/session/data/index.js";

export type { AgentMessage, AgentState };
export type { AssistantMessage, ToolResultMessage, UserMessage };
export { EMPTY_AGENT_STATE } from "@agentchan/creative-agent/browser";

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
