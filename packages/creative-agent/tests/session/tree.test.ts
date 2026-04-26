import { describe, test, expect } from "bun:test";
import type { SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";
import { branchFromLeaf } from "../../src/session/format.js";
import { generateTitle } from "../../src/session/tree.js";

function messageEntry(id: string, parentId: string | null, text = `msg-${id}`): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date(Date.UTC(2026, 3, 26, 0, 0, 0)).toISOString(),
    message: { role: "user", content: [{ type: "text", text }], timestamp: Date.now() } as any,
  };
}

/**
 * Entry graph:
 *
 *       A
 *      / \
 *     B   E
 *    / \
 *   C   D
 */
function branchingEntries(): SessionEntry[] {
  return [
    messageEntry("A", null),
    messageEntry("B", "A"),
    messageEntry("C", "B"),
    messageEntry("D", "B"),
    messageEntry("E", "A"),
  ];
}

describe("entry branch graph", () => {
  test("walks selected leaf to root by parentId", () => {
    expect(branchFromLeaf(branchingEntries(), "D").map((entry) => entry.id))
      .toEqual(["A", "B", "D"]);
    expect(branchFromLeaf(branchingEntries(), "E").map((entry) => entry.id))
      .toEqual(["A", "E"]);
  });

  test("uses the last append entry as default leaf", () => {
    expect(branchFromLeaf(branchingEntries()).map((entry) => entry.id))
      .toEqual(["A", "E"]);
  });

  test("returns empty branch for explicit null leaf", () => {
    expect(branchFromLeaf(branchingEntries(), null)).toEqual([]);
  });

  test("includes non-message entries that are on the selected branch", () => {
    const entries: SessionEntry[] = [
      messageEntry("A", null),
      {
        type: "session_info",
        id: "A-info",
        parentId: "A",
        timestamp: new Date().toISOString(),
        name: "Named",
      },
      messageEntry("B", "A-info"),
    ];

    expect(branchFromLeaf(entries, "B").map((entry) => entry.id))
      .toEqual(["A", "A-info", "B"]);
  });
});

describe("generateTitle", () => {
  test("returns short text as-is", () => {
    expect(generateTitle("hello world")).toBe("hello world");
  });

  test("truncates at 50 chars with ellipsis", () => {
    const long = "a".repeat(60);
    const title = generateTitle(long);
    expect(title.length).toBe(53);
    expect(title.endsWith("...")).toBe(true);
  });

  test("exactly 50 chars is not truncated", () => {
    const exact = "b".repeat(50);
    expect(generateTitle(exact)).toBe(exact);
  });

  test("replaces newlines with spaces", () => {
    expect(generateTitle("line1\nline2\nline3")).toBe("line1 line2 line3");
  });

  test("trims whitespace", () => {
    expect(generateTitle("  hello  ")).toBe("hello");
  });

  test("empty string returns empty", () => {
    expect(generateTitle("")).toBe("");
  });
});
