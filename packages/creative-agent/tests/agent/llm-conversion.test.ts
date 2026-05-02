import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

import {
  bashExecutionToText,
  convertToLlm,
} from "../../src/agent/llm-conversion.js";
import {
  BRANCH_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_PREFIX,
  type BashExecutionMessage,
  type BranchSummaryMessage,
  type CompactionSummaryMessage,
  type CustomMessage,
} from "../../src/session/messages.js";

describe("convertToLlm — bashExecution", () => {
  test("includes successful run output as user message", () => {
    const bash: BashExecutionMessage = {
      role: "bashExecution",
      command: "echo hi",
      output: "hi",
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 1,
    };
    const result = convertToLlm([bash]);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    const block = (result[0]!.content as { type: string; text: string }[])[0]!;
    expect(block.text).toContain("Ran `echo hi`");
    expect(block.text).toContain("hi");
  });

  test("filters bashExecution flagged with excludeFromContext", () => {
    const kept: BashExecutionMessage = {
      role: "bashExecution",
      command: "echo a",
      output: "a",
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 1,
    };
    const dropped: BashExecutionMessage = { ...kept, command: "echo b", output: "b", excludeFromContext: true };
    const result = convertToLlm([kept, dropped]);
    expect(result).toHaveLength(1);
    const block = (result[0]!.content as { type: string; text: string }[])[0]!;
    expect(block.text).toContain("echo a");
  });

  test("non-zero exit code is appended", () => {
    const bash: BashExecutionMessage = {
      role: "bashExecution",
      command: "false",
      output: "",
      exitCode: 1,
      cancelled: false,
      truncated: false,
      timestamp: 1,
    };
    expect(bashExecutionToText(bash)).toContain("Command exited with code 1");
  });

  test("cancelled flag is appended", () => {
    const bash: BashExecutionMessage = {
      role: "bashExecution",
      command: "sleep 99",
      output: "",
      exitCode: undefined,
      cancelled: true,
      truncated: false,
      timestamp: 1,
    };
    expect(bashExecutionToText(bash)).toContain("(command cancelled)");
  });

  test("truncation note appears when fullOutputPath set", () => {
    const bash: BashExecutionMessage = {
      role: "bashExecution",
      command: "yes",
      output: "y\ny",
      exitCode: 0,
      cancelled: false,
      truncated: true,
      fullOutputPath: "/tmp/out",
      timestamp: 1,
    };
    expect(bashExecutionToText(bash)).toContain("[Output truncated. Full output: /tmp/out]");
  });
});

describe("convertToLlm — custom variants", () => {
  test("custom message with string content → user message", () => {
    const msg: CustomMessage = {
      role: "custom",
      customType: "ext.injected",
      content: "hello",
      display: true,
      timestamp: 1,
    };
    const result = convertToLlm([msg]);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    const block = (result[0]!.content as { type: string; text: string }[])[0]!;
    expect(block.text).toBe("hello");
  });

  test("custom message with content array passes through", () => {
    const msg: CustomMessage = {
      role: "custom",
      customType: "ext.injected",
      content: [{ type: "text", text: "from-array" }],
      display: true,
      timestamp: 1,
    };
    const result = convertToLlm([msg]);
    expect(result).toHaveLength(1);
    const block = (result[0]!.content as { type: string; text: string }[])[0]!;
    expect(block.text).toBe("from-array");
  });

  test("branchSummary wraps with BRANCH_SUMMARY_PREFIX", () => {
    const msg: BranchSummaryMessage = {
      role: "branchSummary",
      summary: "abandoned",
      fromId: "x",
      timestamp: 1,
    };
    const result = convertToLlm([msg]);
    const text = (result[0]!.content as { type: string; text: string }[])[0]!.text;
    expect(text.startsWith(BRANCH_SUMMARY_PREFIX)).toBe(true);
    expect(text).toContain("abandoned");
  });

  test("compactionSummary wraps with COMPACTION_SUMMARY_PREFIX", () => {
    const msg: CompactionSummaryMessage = {
      role: "compactionSummary",
      summary: "everything before",
      tokensBefore: 1000,
      timestamp: 1,
    };
    const result = convertToLlm([msg]);
    const text = (result[0]!.content as { type: string; text: string }[])[0]!.text;
    expect(text.startsWith(COMPACTION_SUMMARY_PREFIX)).toBe(true);
    expect(text).toContain("everything before");
  });
});

describe("convertToLlm — passthrough", () => {
  test("user / assistant / toolResult messages pass through unchanged", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "u", timestamp: 1 },
      {
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
        timestamp: 1,
      },
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "noop",
        content: [{ type: "text", text: "ok" }],
        isError: false,
        timestamp: 1,
      },
    ];
    const result = convertToLlm(messages);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "toolResult"]);
  });
});
