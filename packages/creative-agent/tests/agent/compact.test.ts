import { describe, test, expect, beforeEach } from "bun:test";
import { formatCompactSummary, microCompact, clearCompactState } from "../../src/agent/compact.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

// --- Helpers ---

function userMsg(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() } as any;
}

function assistantWithToolCall(id: string, name: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
    stopReason: "toolUse",
  } as any;
}

function toolResult(toolCallId: string, text: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "test",
    content: [{ type: "text", text }],
  } as any;
}

function conversation(toolCount: number, contentLen = 600): AgentMessage[] {
  const msgs: AgentMessage[] = [userMsg("hello")];
  for (let i = 0; i < toolCount; i++) {
    const id = `tool-${i}`;
    msgs.push(assistantWithToolCall(id, `read_${i}`));
    msgs.push(toolResult(id, "y".repeat(contentLen)));
  }
  msgs.push(userMsg("continue"));
  return msgs;
}

function isCompacted(msgs: AgentMessage[], toolCallId: string): boolean {
  const msg = msgs.find(
    (m) => (m as any).role === "toolResult" && (m as any).toolCallId === toolCallId,
  ) as any;
  return msg?.content?.[0]?.text?.startsWith("[Previous:") ?? false;
}

function getResultText(msgs: AgentMessage[], toolCallId: string): string {
  const msg = msgs.find(
    (m) => (m as any).role === "toolResult" && (m as any).toolCallId === toolCallId,
  ) as any;
  return msg?.content?.[0]?.text ?? "";
}

const CONV = "test-conv";

/** Token budget that keeps ~3 tool results of 600-char "y" content (~141 tokens each). */
const TEST_KEEP_BUDGET = 500;

function opts(overrides: Partial<Parameters<typeof microCompact>[1]> = {}) {
  return {
    sessionId: CONV,
    protectFromIndex: Infinity,
    keepRecentTokens: TEST_KEEP_BUDGET,
    ...overrides,
  };
}

// --- Tests ---

describe("microCompact", () => {
  beforeEach(() => clearCompactState(CONV));

  describe("replacement", () => {
    test("compacts oldest beyond token budget", () => {
      const msgs = conversation(5);
      const result = microCompact(msgs, opts());

      expect(isCompacted(result, "tool-0")).toBe(true);
      expect(isCompacted(result, "tool-1")).toBe(true);
      expect(isCompacted(result, "tool-2")).toBe(false);
      expect(isCompacted(result, "tool-3")).toBe(false);
      expect(isCompacted(result, "tool-4")).toBe(false);
    });

    test("keeps all when total tokens within budget", () => {
      const result = microCompact(conversation(3), opts());
      expect(isCompacted(result, "tool-0")).toBe(false);
    });

    test("short results still compacted when outside budget", () => {
      // 10 tools × 100 chars (~24 tokens each) = ~240 tokens total
      // With keepRecentTokens: 100, keeps ~4, compacts ~6
      const result = microCompact(conversation(10, 100), opts({ keepRecentTokens: 100 }));
      expect(isCompacted(result, "tool-0")).toBe(true);
    });

    test("placeholder includes tool name", () => {
      const result = microCompact(conversation(5), opts());
      expect(getResultText(result, "tool-0")).toBe("[Previous: used read_0]");
    });

    test("large tool result consumes more budget, fewer kept", () => {
      // 5 tools: first 4 have 600 chars (~141 tokens), last has 3000 chars (~705 tokens)
      const msgs: AgentMessage[] = [userMsg("hello")];
      for (let i = 0; i < 4; i++) {
        const id = `tool-${i}`;
        msgs.push(assistantWithToolCall(id, `read_${i}`));
        msgs.push(toolResult(id, "y".repeat(600)));
      }
      msgs.push(assistantWithToolCall("tool-4", "read_4"));
      msgs.push(toolResult("tool-4", "y".repeat(3000))); // ~705 tokens
      msgs.push(userMsg("continue"));

      // Budget 800: tool-4(~705) + tool-3(~141) = ~846 > 800, so only tool-4 kept
      const result = microCompact(msgs, opts({ keepRecentTokens: 800 }));
      expect(isCompacted(result, "tool-3")).toBe(true);
      expect(isCompacted(result, "tool-4")).toBe(false);
    });

    test("keeps all when budget is large enough", () => {
      const result = microCompact(conversation(5), opts({ keepRecentTokens: 100_000 }));
      for (let i = 0; i < 5; i++) {
        expect(isCompacted(result, `tool-${i}`)).toBe(false);
      }
    });

    test("always keeps at least one tool result", () => {
      // Single huge tool result exceeding budget
      const msgs: AgentMessage[] = [userMsg("hello")];
      msgs.push(assistantWithToolCall("tool-0", "read_0"));
      msgs.push(toolResult("tool-0", "y".repeat(50_000)));
      msgs.push(userMsg("continue"));

      const result = microCompact(msgs, opts({ keepRecentTokens: 1 }));
      expect(isCompacted(result, "tool-0")).toBe(false);
    });

    test("does not mutate original array", () => {
      const msgs = conversation(5);
      const snapshot = JSON.stringify(msgs);
      microCompact(msgs, opts());
      expect(JSON.stringify(msgs)).toBe(snapshot);
    });
  });

  describe("cache protection", () => {
    test("first call compacts (no prior state → cache expired)", () => {
      const result = microCompact(conversation(5), opts());

      expect(isCompacted(result, "tool-0")).toBe(true);
      expect(isCompacted(result, "tool-1")).toBe(true);
    });

    test("second call defers new compaction", () => {
      microCompact(conversation(5), opts());
      const result = microCompact(conversation(6), opts());

      expect(isCompacted(result, "tool-0")).toBe(true);  // still compacted
      expect(isCompacted(result, "tool-1")).toBe(true);  // still compacted
      expect(isCompacted(result, "tool-2")).toBe(false);  // deferred
    });

    test("prefix is stable across consecutive calls", () => {
      const msgs = conversation(5);
      const r1 = microCompact(msgs, opts());
      const r2 = microCompact(msgs, opts());
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });

    test("deferred compactions accumulate over turns", () => {
      microCompact(conversation(5), opts());
      microCompact(conversation(6), opts());
      const result = microCompact(conversation(7), opts());

      expect(isCompacted(result, "tool-0")).toBe(true);
      expect(isCompacted(result, "tool-1")).toBe(true);
      expect(isCompacted(result, "tool-2")).toBe(false);
      expect(isCompacted(result, "tool-3")).toBe(false);
    });
  });

  describe("compact triggers", () => {
    test("clearCompactState resets (simulates TTL expiry)", () => {
      microCompact(conversation(5), opts());
      clearCompactState(CONV);
      // Next call: no prior state → cache expired → compacts
      const result = microCompact(conversation(6), opts());

      expect(isCompacted(result, "tool-0")).toBe(true);
      expect(isCompacted(result, "tool-2")).toBe(true);
    });
  });

  describe("state isolation", () => {
    test("different sessionIds are independent", () => {
      clearCompactState("a");
      clearCompactState("b");

      microCompact(conversation(5), opts({ sessionId: "a" }));
      // "b" has no state → first call → compacts
      const result = microCompact(conversation(5), opts({ sessionId: "b" }));
      expect(isCompacted(result, "tool-0")).toBe(true);

      clearCompactState("a");
      clearCompactState("b");
    });
  });
});

describe("formatCompactSummary", () => {
  test("extracts the creative summary block", () => {
    const raw = `<analysis>
Internal reasoning.
</analysis>

<summary>
1. Creative Direction:
   noir fantasy

2. Characters and World:
   - a tired detective
</summary>`;

    expect(formatCompactSummary(raw)).toBe("1. Creative Direction:\n   noir fantasy\n\n2. Characters and World:\n   - a tired detective");
  });
});
