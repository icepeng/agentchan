import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";
import type { CompactionSummaryMessage } from "@agentchan/creative-agent/src/session/messages.js";
import type { AgentState } from "../../src/client/entities/agent-state/index.js";
import { toRendererAgentState } from "../../src/client/entities/renderer/useRendererOutput.js";

function usage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("toRendererAgentState", () => {
  test("filters compactionSummary while passing LLM-shaped messages through", () => {
    const user: UserMessage = { role: "user", content: "hello", timestamp: 1 };
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-x",
      usage: usage(),
      stopReason: "stop",
      timestamp: 2,
    };
    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "noop",
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: 3,
    };
    const compaction: CompactionSummaryMessage = {
      role: "compactionSummary",
      summary: "internal summary",
      tokensBefore: 100,
      timestamp: 4,
    };
    const state: AgentState = {
      messages: [user, compaction, assistant, toolResult] satisfies AgentMessage[],
      isStreaming: true,
      streamingMessage: assistant,
      pendingToolCalls: new Set(["tc1", "tc2"]),
      errorMessage: "boom",
    };

    expect(toRendererAgentState(state)).toEqual({
      messages: [user, assistant, toolResult],
      isStreaming: true,
      streamingMessage: assistant,
      pendingToolCalls: ["tc1", "tc2"],
      errorMessage: "boom",
    });
  });
});
