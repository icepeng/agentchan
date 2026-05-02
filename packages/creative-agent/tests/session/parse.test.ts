import { describe, expect, test } from "bun:test";

import {
  getLatestCompactionEntry,
  parseSessionEntries,
} from "../../src/session/parse.js";
import type { CompactionEntry, SessionEntry } from "../../src/session/types.js";

describe("parseSessionEntries", () => {
  test("parses well-formed JSONL with header + entries", () => {
    const content = [
      '{"type":"session","version":3,"id":"s","timestamp":"t","cwd":"/"}',
      '{"type":"message","id":"e1","parentId":null,"timestamp":"t","message":{"role":"user","content":"hi","timestamp":1}}',
    ].join("\n");
    const result = parseSessionEntries(content);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("session");
    expect(result[1]!.type).toBe("message");
  });

  test("skips malformed lines", () => {
    const content = [
      '{"type":"session","version":3,"id":"s","timestamp":"t","cwd":"/"}',
      "{not-json",
      '{"type":"message","id":"e1","parentId":null,"timestamp":"t","message":{"role":"user","content":"a","timestamp":1}}',
      "garbage",
      '{"type":"message","id":"e2","parentId":"e1","timestamp":"t","message":{"role":"user","content":"b","timestamp":2}}',
    ].join("\n");
    const result = parseSessionEntries(content);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.type)).toEqual(["session", "message", "message"]);
  });

  test("skips blank lines", () => {
    const content = [
      '{"type":"session","version":3,"id":"s","timestamp":"t","cwd":"/"}',
      "",
      "   ",
      '{"type":"message","id":"e1","parentId":null,"timestamp":"t","message":{"role":"user","content":"x","timestamp":1}}',
    ].join("\n");
    expect(parseSessionEntries(content)).toHaveLength(2);
  });

  test("empty content returns []", () => {
    expect(parseSessionEntries("")).toEqual([]);
    expect(parseSessionEntries("   \n\n")).toEqual([]);
  });
});

describe("getLatestCompactionEntry", () => {
  test("returns null when no compaction entries exist", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "t",
        message: { role: "user", content: "hi", timestamp: 1 },
      },
    ];
    expect(getLatestCompactionEntry(entries)).toBeNull();
  });

  test("returns the most-recent compaction when multiple exist", () => {
    const entries: SessionEntry[] = [
      {
        type: "compaction",
        id: "c1",
        parentId: null,
        timestamp: "t1",
        summary: "first",
        firstKeptEntryId: "x",
        tokensBefore: 1,
      } as CompactionEntry,
      {
        type: "message",
        id: "e1",
        parentId: "c1",
        timestamp: "t2",
        message: { role: "user", content: "hi", timestamp: 2 },
      },
      {
        type: "compaction",
        id: "c2",
        parentId: "e1",
        timestamp: "t3",
        summary: "second",
        firstKeptEntryId: "e1",
        tokensBefore: 2,
      } as CompactionEntry,
      {
        type: "message",
        id: "e2",
        parentId: "c2",
        timestamp: "t4",
        message: { role: "user", content: "ok", timestamp: 4 },
      },
    ];
    const latest = getLatestCompactionEntry(entries);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe("c2");
    expect(latest!.summary).toBe("second");
  });
});
