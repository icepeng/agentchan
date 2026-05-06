import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { convertToLlm } from "../../src/agent/llm-conversion.js";
import {
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  type CompactionSummaryMessage,
} from "../../src/session/messages.js";

describe("convertToLlm", () => {
  test("user messages pass through unchanged", () => {
    const message: AgentMessage = { role: "user", content: "u", timestamp: 1 };
    expect(convertToLlm([message])).toEqual([message]);
  });

  test("assistant messages pass through unchanged", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: "a" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-x",
      stopReason: "stop",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      timestamp: 2,
    };

    expect(convertToLlm([message])).toEqual([message]);
  });

  test("toolResult messages pass through unchanged", () => {
    const message: AgentMessage = {
      role: "toolResult",
      toolCallId: "t1",
      toolName: "noop",
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: 3,
    };

    expect(convertToLlm([message])).toEqual([message]);
  });

  test("compactionSummary wraps summary as a user message", () => {
    const message: CompactionSummaryMessage = {
      role: "compactionSummary",
      summary: "everything before",
      tokensBefore: 1000,
      timestamp: 4,
    };

    const result = convertToLlm([message]);

    expect(result).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              COMPACTION_SUMMARY_PREFIX +
              "everything before" +
              COMPACTION_SUMMARY_SUFFIX,
          },
        ],
        timestamp: 4,
      },
    ]);
  });
});
