import { describe, expect, test } from "bun:test";

import { buildSessionContext } from "../../src/session/context.js";
import type { SessionEntry } from "../../src/session/types.js";

const ts = (n: number) => new Date(2024, 0, 1, 0, 0, n).toISOString();

function userMsg(id: string, parentId: string | null, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: ts(parseInt(id.replace(/[^0-9]/g, ""), 10)),
    message: { role: "user", content: text, timestamp: 0 },
  };
}

function assistantMsg(id: string, parentId: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: ts(parseInt(id.replace(/[^0-9]/g, ""), 10)),
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
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
      timestamp: 0,
    },
  };
}

describe("buildSessionContext — empty / null leaf", () => {
  test("empty entries returns empty context", () => {
    const ctx = buildSessionContext([]);
    expect(ctx.messages).toEqual([]);
    expect(ctx.thinkingLevel).toBe("off");
    expect(ctx.model).toBeNull();
  });

  test("leafId === null returns empty context regardless of entries", () => {
    const entries: SessionEntry[] = [userMsg("e1", null, "hi")];
    expect(buildSessionContext(entries, null).messages).toEqual([]);
  });
});

describe("buildSessionContext — branch traversal", () => {
  test("walks leaf → root in order", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u1"),
      assistantMsg("e2", "e1", "a1"),
      userMsg("e3", "e2", "u2"),
    ];
    const ctx = buildSessionContext(entries, "e3");
    expect(ctx.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  test("ignores siblings off the path to leaf", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u1"),
      assistantMsg("e2", "e1", "branch-a"),
      assistantMsg("e3", "e1", "branch-b"),
    ];
    const ctx = buildSessionContext(entries, "e3");
    expect(ctx.messages).toHaveLength(2);
    expect(
      (ctx.messages[1]! as { content: { text: string }[] }).content[0]!.text,
    ).toBe("branch-b");
  });

  test("undefined leaf falls back to last entry", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u1"),
      assistantMsg("e2", "e1", "a1"),
    ];
    const ctx = buildSessionContext(entries);
    expect(ctx.messages).toHaveLength(2);
  });
});

describe("buildSessionContext — settings on path", () => {
  test("thinking_level_change updates thinkingLevel", () => {
    const entries: SessionEntry[] = [
      {
        type: "thinking_level_change",
        id: "e1",
        parentId: null,
        timestamp: ts(1),
        thinkingLevel: "high",
      },
      userMsg("e2", "e1", "hi"),
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.thinkingLevel).toBe("high");
  });

  test("model_change sets model", () => {
    const entries: SessionEntry[] = [
      {
        type: "model_change",
        id: "e1",
        parentId: null,
        timestamp: ts(1),
        provider: "anthropic",
        modelId: "claude-x",
      },
      userMsg("e2", "e1", "hi"),
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.model).toEqual({ provider: "anthropic", modelId: "claude-x" });
  });

  test("assistant message also sets model", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u"),
      assistantMsg("e2", "e1", "a"),
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.model).toEqual({ provider: "anthropic", modelId: "claude-x" });
  });
});

describe("buildSessionContext — compaction cut", () => {
  test("emits summary then entries from firstKeptEntryId onward", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u1"),
      assistantMsg("e2", "e1", "a1"),
      userMsg("e3", "e2", "u2"),
      assistantMsg("e4", "e3", "a2"),
      {
        type: "compaction",
        id: "c1",
        parentId: "e4",
        timestamp: ts(5),
        summary: "compacted",
        firstKeptEntryId: "e3",
        tokensBefore: 100,
      },
      userMsg("e5", "c1", "u3"),
    ];
    const ctx = buildSessionContext(entries, "e5");
    const roles = ctx.messages.map((m) => m.role);
    expect(roles[0]).toBe("compactionSummary");
    expect(ctx.messages).toHaveLength(4);
    expect(roles).toEqual(["compactionSummary", "user", "assistant", "user"]);
  });
});

describe("buildSessionContext — variant emission", () => {
  test("custom_message → custom AgentMessage", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u"),
      {
        type: "custom_message",
        id: "e2",
        parentId: "e1",
        timestamp: ts(2),
        customType: "ext.injected",
        content: "injected",
        display: true,
      },
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.messages[1]!.role).toBe("custom");
  });

  test("branch_summary with non-empty summary → branchSummary AgentMessage", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u"),
      {
        type: "branch_summary",
        id: "e2",
        parentId: "e1",
        timestamp: ts(2),
        fromId: "e1",
        summary: "abandoned branch",
      },
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.messages[1]!.role).toBe("branchSummary");
  });

  test("branch_summary with empty summary is skipped", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u"),
      {
        type: "branch_summary",
        id: "e2",
        parentId: "e1",
        timestamp: ts(2),
        fromId: "e1",
        summary: "",
      },
    ];
    const ctx = buildSessionContext(entries, "e2");
    expect(ctx.messages).toHaveLength(1);
  });

  test("custom and label and session_info entries don't emit messages", () => {
    const entries: SessionEntry[] = [
      userMsg("e1", null, "u"),
      {
        type: "custom",
        id: "e2",
        parentId: "e1",
        timestamp: ts(2),
        customType: "ext.bookkeeping",
      },
      {
        type: "label",
        id: "e3",
        parentId: "e2",
        timestamp: ts(3),
        targetId: "e1",
        label: "marker",
      },
      {
        type: "session_info",
        id: "e4",
        parentId: "e3",
        timestamp: ts(4),
        name: "title",
      },
    ];
    const ctx = buildSessionContext(entries, "e4");
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]!.role).toBe("user");
  });
});
