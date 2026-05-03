import { describe, test, expect } from "bun:test";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
  Usage,
} from "@mariozechner/pi-ai";
import type { SessionMessageEntry } from "@/client/entities/session/index.js";
import {
  aggregateUsage,
  EMPTY_AGGREGATED_USAGE,
} from "@/client/entities/agent-state/aggregateUsage.js";

function makeUsage(over: Partial<Usage> = {}): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...over,
  };
}

let nextId = 0;

function makeEntry(message: Message): SessionMessageEntry {
  const id = `e${++nextId}`;
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "t",
    message,
  };
}

function assistantEntry(usage: Partial<Usage> | undefined): SessionMessageEntry {
  const msg: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "anthropic-messages" as never,
    provider: "anthropic" as never,
    model: "test-model",
    usage: makeUsage(usage),
    stopReason: "stop",
    timestamp: 0,
  };
  return makeEntry(msg);
}

function userEntry(): SessionMessageEntry {
  const msg: UserMessage = {
    role: "user",
    content: "hello",
    timestamp: 0,
  };
  return makeEntry(msg);
}

function toolResultEntry(): SessionMessageEntry {
  const msg: ToolResultMessage = {
    role: "toolResult",
    toolCallId: "tc",
    toolName: "test_tool",
    content: [{ type: "text", text: "ok" }],
    isError: false,
    timestamp: 0,
  };
  return makeEntry(msg);
}

describe("aggregateUsage", () => {
  test("returns zeroed totals for empty entry list", () => {
    expect(aggregateUsage([])).toEqual(EMPTY_AGGREGATED_USAGE);
  });

  test("returns single assistant entry's usage as-is", () => {
    const entry = assistantEntry({
      input: 1000,
      output: 200,
      cacheRead: 50,
      cacheWrite: 10,
      cost: {
        input: 0.001,
        output: 0.002,
        cacheRead: 0.0001,
        cacheWrite: 0.00005,
        total: 0.00315,
      },
    });
    expect(aggregateUsage([entry])).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 50,
      cacheCreationTokens: 10,
      cost: 0.00315,
    });
  });

  test("sums multi-entry turn (assistant + toolResult + assistant)", () => {
    const a1 = assistantEntry({
      input: 100,
      output: 20,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 },
    });
    const tr = toolResultEntry();
    const a2 = assistantEntry({
      input: 250,
      output: 80,
      cacheRead: 30,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 1.25 },
    });
    expect(aggregateUsage([a1, tr, a2])).toEqual({
      inputTokens: 350,
      outputTokens: 100,
      cachedInputTokens: 30,
      cacheCreationTokens: 0,
      cost: 1.75,
    });
  });

  test("treats missing usage on assistant entry as zero", () => {
    const a1 = assistantEntry({
      input: 100,
      output: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 },
    });
    const noUsage = makeEntry({
      role: "assistant",
      content: [],
      api: "anthropic-messages" as never,
      provider: "anthropic" as never,
      model: "test-model",
      usage: undefined as unknown as Usage,
      stopReason: "stop",
      timestamp: 0,
    });
    expect(aggregateUsage([a1, noUsage])).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      cost: 0.5,
    });
  });

  test("accumulates cache tokens across entries", () => {
    const a1 = assistantEntry({
      input: 10,
      cacheRead: 100,
      cacheWrite: 50,
    });
    const a2 = assistantEntry({
      input: 5,
      cacheRead: 200,
      cacheWrite: 25,
    });
    expect(aggregateUsage([a1, a2])).toEqual({
      inputTokens: 15,
      outputTokens: 0,
      cachedInputTokens: 300,
      cacheCreationTokens: 75,
      cost: 0,
    });
  });

  test("ignores user and toolResult entries when summing", () => {
    const u = userEntry();
    const tr = toolResultEntry();
    const a = assistantEntry({
      input: 100,
      output: 50,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.25 },
    });
    expect(aggregateUsage([u, tr, a, u])).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      cost: 0.25,
    });
  });
});
