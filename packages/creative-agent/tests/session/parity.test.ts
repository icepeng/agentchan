/**
 * Permanent parity guard against pi-coding-agent (ADR-0010).
 *
 * Synthesizes a fixture covering all 9 SessionEntry variants and asserts
 * that vendored `buildSessionContext` produces deep-equal output to Pi's.
 * Failure is the codified signal to review whether to cherry-pick the
 * upstream change.
 */

import { describe, expect, test } from "bun:test";
import {
  buildSessionContext as piBuildSessionContext,
  type SessionEntry as PiSessionEntry,
} from "@mariozechner/pi-coding-agent";

import { buildSessionContext } from "../../src/session/context.js";
import type { SessionEntry } from "../../src/session/types.js";

const ts = (n: number) => new Date(2024, 0, 1, 0, 0, n).toISOString();

const fixtureWithCompaction: SessionEntry[] = [
  {
    type: "thinking_level_change",
    id: "e1",
    parentId: null,
    timestamp: ts(1),
    thinkingLevel: "low",
  },
  {
    type: "model_change",
    id: "e2",
    parentId: "e1",
    timestamp: ts(2),
    provider: "anthropic",
    modelId: "claude-x",
  },
  {
    type: "message",
    id: "e3",
    parentId: "e2",
    timestamp: ts(3),
    message: { role: "user", content: "u1", timestamp: 3 },
  },
  {
    type: "message",
    id: "e4",
    parentId: "e3",
    timestamp: ts(4),
    message: {
      role: "assistant",
      content: [{ type: "text", text: "a1" }],
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
      timestamp: 4,
    },
  },
  {
    type: "branch_summary",
    id: "e5",
    parentId: "e4",
    timestamp: ts(5),
    fromId: "e4",
    summary: "branch summary",
  },
  {
    type: "session_info",
    id: "e6",
    parentId: "e5",
    timestamp: ts(6),
    name: "Title",
  },
  {
    type: "label",
    id: "e7",
    parentId: "e6",
    timestamp: ts(7),
    targetId: "e3",
    label: "marker",
  },
  {
    type: "custom",
    id: "e8",
    parentId: "e7",
    timestamp: ts(8),
    customType: "ext.bookkeeping",
    data: { foo: "bar" },
  },
  {
    type: "custom_message",
    id: "e9",
    parentId: "e8",
    timestamp: ts(9),
    customType: "ext.injected",
    content: "injected text",
    display: true,
  },
  {
    type: "compaction",
    id: "e10",
    parentId: "e9",
    timestamp: ts(10),
    summary: "compacted",
    firstKeptEntryId: "e9",
    tokensBefore: 100,
  },
  {
    type: "message",
    id: "e11",
    parentId: "e10",
    timestamp: ts(11),
    message: { role: "user", content: "u2", timestamp: 11 },
  },
];

const fixtureNoCompaction: SessionEntry[] = fixtureWithCompaction.filter(
  (e) => e.type !== "compaction",
);

describe("parity — buildSessionContext", () => {
  test("with compaction on path: vendored output matches Pi", () => {
    const leafId = fixtureWithCompaction[fixtureWithCompaction.length - 1]!.id;
    const ours = buildSessionContext(fixtureWithCompaction, leafId);
    const theirs = piBuildSessionContext(
      fixtureWithCompaction as unknown as PiSessionEntry[],
      leafId,
    );
    expect(ours).toEqual(theirs as unknown as typeof ours);
  });

  test("without compaction: vendored output matches Pi", () => {
    const leafId = fixtureNoCompaction[fixtureNoCompaction.length - 1]!.id;
    const ours = buildSessionContext(fixtureNoCompaction, leafId);
    const theirs = piBuildSessionContext(
      fixtureNoCompaction as unknown as PiSessionEntry[],
      leafId,
    );
    expect(ours).toEqual(theirs as unknown as typeof ours);
  });

  test("leafId === null: both return empty context", () => {
    const ours = buildSessionContext(fixtureWithCompaction, null);
    const theirs = piBuildSessionContext(
      fixtureWithCompaction as unknown as PiSessionEntry[],
      null,
    );
    expect(ours).toEqual(theirs as unknown as typeof ours);
  });

  test("leafId === undefined: falls back to last entry, matches Pi", () => {
    const ours = buildSessionContext(fixtureWithCompaction);
    const theirs = piBuildSessionContext(
      fixtureWithCompaction as unknown as PiSessionEntry[],
    );
    expect(ours).toEqual(theirs as unknown as typeof ours);
  });
});
