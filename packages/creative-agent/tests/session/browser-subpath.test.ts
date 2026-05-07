import { describe, expect, test } from "bun:test";

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  CompactionEntry,
  SessionEntry,
  SessionMessageEntry,
} from "@agentchan/creative-agent/session";
import {
  buildSiblingsByEntry,
  defaultLeafId,
  selectBranch,
  selectBranchMessages,
  selectMessageEntries,
  selectSiblings,
  selectVisibleMessages,
} from "@agentchan/creative-agent/session";

function messageEntry(
  id: string,
  parentId: string | null,
  message: AgentMessage,
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: `2026-01-01T00:00:0${id.length}.000Z`,
    message,
  };
}

const userMessage: AgentMessage = {
  role: "user",
  content: "hello",
  timestamp: 1,
};

const assistantMessage: AgentMessage = {
  role: "assistant",
  content: [],
  api: "anthropic-messages" as never,
  provider: "anthropic" as never,
  model: "claude-test",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: 2,
};

const toolResultMessage: AgentMessage = {
  role: "toolResult",
  toolCallId: "tc",
  toolName: "read",
  content: [{ type: "text", text: "ok" }],
  isError: false,
  timestamp: 3,
};

describe("@agentchan/creative-agent/session", () => {
  test("projects a root-to-leaf Branch and preserves empty/null leaf behavior", () => {
    const entries: SessionEntry[] = [
      messageEntry("e1", null, userMessage),
      messageEntry("e2", "e1", assistantMessage),
      messageEntry("e3", "e1", toolResultMessage),
    ];

    expect(selectBranch([], null)).toEqual([]);
    expect(selectBranch(entries, null)).toEqual([]);
    expect(selectBranch(entries, "missing")).toEqual([]);
    expect(selectBranch(entries, "e2").map((entry) => entry.id)).toEqual([
      "e1",
      "e2",
    ]);
  });

  test("resolves the default leaf as the last appended entry", () => {
    expect(defaultLeafId([])).toBeNull();
    expect(
      defaultLeafId([
        messageEntry("first", null, userMessage),
        messageEntry("last", "first", assistantMessage),
      ]),
    ).toBe("last");
  });

  test("looks up siblings in append order", () => {
    const entries: SessionEntry[] = [
      messageEntry("root", null, userMessage),
      messageEntry("a", "root", assistantMessage),
      messageEntry("b", "root", assistantMessage),
      messageEntry("c", "root", assistantMessage),
    ];

    expect(selectSiblings(entries, "b")).toEqual(["a", "b", "c"]);
    expect(buildSiblingsByEntry(entries).get("c")).toEqual(["a", "b", "c"]);
  });

  test("projects visible messages and filters non-message Session entries", () => {
    const compaction: CompactionEntry = {
      type: "compaction",
      id: "compact",
      parentId: "tool",
      timestamp: "2026-01-01T00:00:04.000Z",
      summary: "summary",
      firstKeptEntryId: "user",
      tokensBefore: 100,
    };
    const entries: SessionEntry[] = [
      messageEntry("user", null, userMessage),
      {
        type: "session_info",
        id: "info",
        parentId: "user",
        timestamp: "2026-01-01T00:00:02.000Z",
        name: "Branch name",
      },
      messageEntry("assistant", "info", assistantMessage),
      messageEntry("tool", "assistant", toolResultMessage),
      compaction,
    ];

    expect(selectMessageEntries(entries).map((entry) => entry.id)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(selectVisibleMessages(entries)).toEqual([
      userMessage,
      assistantMessage,
      toolResultMessage,
    ]);
    expect(selectBranchMessages(entries, "compact")).toEqual([
      userMessage,
      assistantMessage,
      toolResultMessage,
    ]);
  });

  test("keeps the browser-safe surface small", async () => {
    const sessionModule = await import("@agentchan/creative-agent/session");

    expect("buildSessionContext" in sessionModule).toBe(false);
    expect("createSessionStorage" in sessionModule).toBe(false);
    expect("createAgentContext" in sessionModule).toBe(false);

    const browserSource = await Bun.file(
      new URL("../../src/session/browser.ts", import.meta.url),
    ).text();
    const branchSource = await Bun.file(
      new URL("../../src/session/branch.ts", import.meta.url),
    ).text();
    const runtimeSources = `${browserSource}\n${branchSource}`;

    expect(runtimeSources).not.toMatch(/from "\.\/(?:storage|context|format|parse|messages)\.js"/);
    expect(runtimeSources).not.toMatch(/from "\.\.\/(?:agent|tools|skills|workspace)\//);
    expect(runtimeSources).not.toMatch(/from "(?:fs|node:fs|bun:sqlite|@mariozechner\/pi-ai)"/);
  });
});
