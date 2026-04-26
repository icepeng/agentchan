import { describe, test, expect } from "bun:test";
import { buildSessionContext, type SessionEntry, type SessionMessageEntry } from "@mariozechner/pi-coding-agent";
import {
  CURRENT_SESSION_VERSION,
  parseSessionFile,
  branchFromLeaf,
  deriveSessionCreatedAt,
  deriveSessionProviderModel,
  deriveSessionTitle,
  serializeEntries,
} from "../../src/session/format.js";

function iso(n: number): string {
  return new Date(n).toISOString();
}

function makeMessageEntry(
  id: string,
  parentId: string | null,
  role: "user" | "assistant" = "user",
  text = `msg-${id}`,
  timestamp = 1000 + parseInt(id.replace(/\D/g, "") || "0") * 100,
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: iso(timestamp),
    message: role === "assistant"
      ? {
        role: "assistant",
        content: [{ type: "text", text }],
        provider: "google",
        model: "gemini-test",
        usage: { input: 1, output: 2, totalTokens: 3, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      } as any
      : { role: "user", content: [{ type: "text", text }], timestamp } as any,
  };
}

const HEADER_LINE = JSON.stringify({
  type: "session",
  version: CURRENT_SESSION_VERSION,
  id: "sess-1",
  timestamp: iso(1000),
  cwd: "/tmp/project",
  mode: "meta",
});

function buildJSONL(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("parseSessionFile", () => {
  test("parses pi header + SessionEntry lines", () => {
    const entry1 = makeMessageEntry("n1", null);
    const entry2 = makeMessageEntry("n2", "n1", "assistant");
    const content = buildJSONL(HEADER_LINE, JSON.stringify(entry1), JSON.stringify(entry2));

    const result = parseSessionFile(content);

    expect(result.header?.type).toBe("session");
    expect(result.header?.version).toBe(CURRENT_SESSION_VERSION);
    expect(result.header?.mode).toBe("meta");
    expect(result.headerLine).toBe(HEADER_LINE);
    expect(result.entries.map((e) => e.id)).toEqual(["n1", "n2"]);
  });

  test("keeps non-message session entries", () => {
    const entry = makeMessageEntry("n1", null);
    const info: SessionEntry = {
      type: "session_info",
      id: "info1",
      parentId: "n1",
      timestamp: iso(1100),
      name: "Named",
    };
    const result = parseSessionFile(buildJSONL(HEADER_LINE, JSON.stringify(entry), JSON.stringify(info)));

    expect(result.entries.map((e) => e.type)).toEqual(["message", "session_info"]);
  });

  test("ignores malformed non-entry lines after header", () => {
    const result = parseSessionFile(buildJSONL(HEADER_LINE, JSON.stringify({ type: "ignored" })));
    expect(result.entries).toEqual([]);
  });

  test("handles empty content", () => {
    const result = parseSessionFile("");
    expect(result.header).toBeNull();
    expect(result.entries).toEqual([]);
  });
});

describe("branchFromLeaf", () => {
  test("walks parentId chain from selected leaf", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null),
      makeMessageEntry("n2", "n1"),
      makeMessageEntry("n3", "n1"),
    ];

    expect(branchFromLeaf(entries, "n2").map((e) => e.id)).toEqual(["n1", "n2"]);
    expect(branchFromLeaf(entries).map((e) => e.id)).toEqual(["n1", "n3"]);
  });

  test("explicit null leaf returns empty branch", () => {
    expect(branchFromLeaf([makeMessageEntry("n1", null)], null)).toEqual([]);
  });
});

describe("compaction context", () => {
  test("branch and LLM context include compaction summary with kept entries", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null, "user", "old"),
      makeMessageEntry("n2", "n1", "assistant", "kept"),
      {
        type: "compaction",
        id: "c1",
        parentId: "n2",
        timestamp: iso(1300),
        summary: "summary text",
        firstKeptEntryId: "n2",
        tokensBefore: 123,
      },
      makeMessageEntry("n3", "c1", "user", "after"),
    ];

    const branch = branchFromLeaf(entries, "n3");
    expect(branch.map((entry) => entry.id)).toEqual(["n1", "n2", "c1", "n3"]);

    const context = buildSessionContext(entries, "n3");
    expect(context.messages.map((message) => message.role)).toEqual([
      "compactionSummary",
      "assistant",
      "user",
    ]);
    expect(context.messages[0]).toMatchObject({
      role: "compactionSummary",
      summary: "summary text",
      tokensBefore: 123,
    });
  });
});

describe("session metadata derivation", () => {
  test("derives metadata from header and entries", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null, "user", "Hello there!"),
      makeMessageEntry("n2", "n1", "assistant", "Hi!"),
    ];
    const header = JSON.parse(HEADER_LINE);
    const model = deriveSessionProviderModel(entries);

    expect(deriveSessionTitle(entries)).toBe("Hello there!");
    expect(deriveSessionCreatedAt(header, entries)).toBe(1000);
    expect(model.provider).toBe("google");
    expect(model.model).toBe("gemini-test");
    expect(header.mode).toBe("meta");
  });

  test("session_info overrides generated title", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null, "user", "Hello there!"),
      { type: "session_info", id: "info1", parentId: "n1", timestamp: iso(1200), name: "Named Session" },
    ];

    expect(deriveSessionTitle(entries)).toBe("Named Session");
  });

  test("empty session_info clears explicit name and falls back to generated title", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null, "user", "Hello there!"),
      { type: "session_info", id: "info1", parentId: "n1", timestamp: iso(1200), name: "Named Session" },
      { type: "session_info", id: "info2", parentId: "info1", timestamp: iso(1300), name: "" },
    ];

    expect(deriveSessionTitle(entries)).toBe("Hello there!");
  });

  test("title truncated at 50 chars", () => {
    const longText = "x".repeat(60);
    const title = deriveSessionTitle([makeMessageEntry("n1", null, "user", longText)]);

    expect(title.length).toBe(53);
    expect(title.endsWith("...")).toBe(true);
  });

  test("title ignores injected skill body", () => {
    const skillText = `<skill_content name="outline">\n# Outline Skill\n\nLong private skill body.\n</skill_content>\n\n<command-name>/outline</command-name>\n<command-args>draft chapter 2</command-args>`;
    const entry = makeMessageEntry("n1", null, "user", skillText);

    expect(deriveSessionTitle([entry])).toBe("/outline draft chapter 2");
  });

  test("parentSession is exposed as compactedFrom metadata", () => {
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: "s",
      timestamp: iso(1000),
      cwd: "/tmp/project",
      parentSession: "old-id",
      mode: "meta",
    } as const;

    expect(header.parentSession).toBe("old-id");
    expect(header.mode).toBe("meta");
  });
});

describe("serialization", () => {
  test("round-trips entries", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("n1", null),
      makeMessageEntry("n2", "n1", "assistant"),
    ];
    const serialized = serializeEntries(HEADER_LINE, entries);
    const reparsed = parseSessionFile(serialized);

    expect(reparsed.header?.id).toBe("sess-1");
    expect(reparsed.entries.map((e) => e.id)).toEqual(["n1", "n2"]);
  });
});
