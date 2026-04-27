import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { UserMessage, AssistantMessage } from "@mariozechner/pi-ai";

import {
  createSessionStorage,
  branchFromLeaf,
  defaultLeafId,
  buildSessionContext,
  type DraftEntry,
  type SessionMessageEntry,
  type CompactionEntry,
} from "../../src/session/index.js";

const SLUG = "test-project";

let projectsDir: string;
let storage: ReturnType<typeof createSessionStorage>;

beforeEach(async () => {
  projectsDir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
  storage = createSessionStorage(projectsDir);
});

afterEach(async () => {
  await rm(projectsDir, { recursive: true, force: true });
});

function userDraft(text: string): DraftEntry {
  const message: UserMessage = { role: "user", content: text, timestamp: Date.now() };
  return { type: "message", message } as DraftEntry;
}

function assistantDraft(text: string): DraftEntry {
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-x",
    stopReason: "stop",
    usage: {
      input: 10, output: 5, cacheRead: 0, cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: Date.now(),
  };
  return { type: "message", message } as DraftEntry;
}

describe("storage — create / read / append", () => {
  test("createSession writes a Pi-compatible header line with mode", async () => {
    const info = await storage.createSession(SLUG, { mode: "meta" });
    expect(info.id).toBeTruthy();
    expect(info.mode).toBe("meta");
    expect(info.title).toBe("New session");

    const filePath = info.path;
    const content = await readFile(filePath, "utf8");
    const firstLine = content.split("\n")[0]!;
    const header = JSON.parse(firstLine);
    expect(header.type).toBe("session");
    expect(header.mode).toBe("meta");
    expect(typeof header.id).toBe("string");
    expect(typeof header.timestamp).toBe("string");
  });

  test("readSession on an empty session returns leafId=null", async () => {
    const info = await storage.createSession(SLUG, {});
    const data = await storage.readSession(SLUG, info.id);
    expect(data).not.toBeNull();
    expect(data!.entries).toEqual([]);
    expect(data!.leafId).toBeNull();
  });

  test("appendAtLeaf links parent chain and assigns ids/timestamps", async () => {
    const info = await storage.createSession(SLUG, {});

    const persisted = await storage.appendAtLeaf(SLUG, info.id, null, [
      userDraft("hello"),
      assistantDraft("hi"),
    ]);

    expect(persisted).toHaveLength(2);
    expect(persisted[0]!.parentId).toBeNull();
    expect(persisted[1]!.parentId).toBe(persisted[0]!.id);
    expect(persisted[0]!.id).not.toBe(persisted[1]!.id);
    expect(typeof persisted[0]!.timestamp).toBe("string");

    const data = await storage.readSession(SLUG, info.id);
    expect(data!.entries).toHaveLength(2);
    expect(data!.leafId).toBe(persisted[1]!.id);
  });

  test("appendAtLeaf rejects an invalid leafId", async () => {
    const info = await storage.createSession(SLUG, {});
    await expect(
      storage.appendAtLeaf(SLUG, info.id, "no-such-id", [userDraft("hi")]),
    ).rejects.toThrow(/Invalid leafId/);
  });

  test("appending at a past leaf creates a sibling subtree", async () => {
    const info = await storage.createSession(SLUG, {});
    const first = await storage.appendAtLeaf(SLUG, info.id, null, [
      userDraft("hello"),
      assistantDraft("hi"),
    ]);
    const userId = first[0]!.id;

    // Append a new branch under the same user message.
    const branchEntries = await storage.appendAtLeaf(SLUG, info.id, userId, [
      assistantDraft("alt response"),
    ]);

    const data = await storage.readSession(SLUG, info.id);
    expect(data!.entries).toHaveLength(3);
    // Default leafId is the most recent append.
    expect(data!.leafId).toBe(branchEntries[0]!.id);

    // branchFromLeaf should return [user, branchAssistant], not the original assistant.
    const branch = branchFromLeaf(data!.entries, branchEntries[0]!.id);
    expect(branch.map((e) => e.id)).toEqual([userId, branchEntries[0]!.id]);
  });

  test("readSession with explicit leafId rejects unknown ids", async () => {
    const info = await storage.createSession(SLUG, {});
    await storage.appendAtLeaf(SLUG, info.id, null, [userDraft("hi")]);
    await expect(
      storage.readSession(SLUG, info.id, "no-such-id"),
    ).rejects.toThrow(/Invalid leafId/);
  });
});

describe("title derivation", () => {
  test("session_info entry overrides first-message fallback", async () => {
    const info = await storage.createSession(SLUG, {});
    await storage.appendAtLeaf(SLUG, info.id, null, [userDraft("hello there")]);
    let data = await storage.readSession(SLUG, info.id);
    expect(data!.info.title).toBe("hello there");

    await storage.appendAtLeaf(SLUG, info.id, data!.leafId, [
      { type: "session_info", name: "Renamed" } as DraftEntry,
    ]);
    data = await storage.readSession(SLUG, info.id);
    expect(data!.info.title).toBe("Renamed");
  });
});

describe("branch + buildSessionContext", () => {
  test("defaultLeafId returns the last appended entry id", async () => {
    const info = await storage.createSession(SLUG, {});
    const persisted = await storage.appendAtLeaf(SLUG, info.id, null, [
      userDraft("u1"),
      assistantDraft("a1"),
      userDraft("u2"),
    ]);
    const data = await storage.readSession(SLUG, info.id);
    expect(defaultLeafId(data!.entries)).toBe(persisted[2]!.id);
  });

  test("branchFromLeaf throws on invalid leafId", async () => {
    const info = await storage.createSession(SLUG, {});
    await storage.appendAtLeaf(SLUG, info.id, null, [userDraft("x")]);
    const data = await storage.readSession(SLUG, info.id);
    expect(() => branchFromLeaf(data!.entries, "missing")).toThrow(/Invalid leafId/);
  });

  test("compaction entry is rebuilt by buildSessionContext as a summary message", async () => {
    const info = await storage.createSession(SLUG, {});
    const turn = await storage.appendAtLeaf(SLUG, info.id, null, [
      userDraft("hello"),
      assistantDraft("hi"),
    ]);
    const tailLeaf = turn[turn.length - 1]!.id;

    const compactionDraft: DraftEntry = {
      type: "compaction",
      summary: "the conversation was about greetings",
      firstKeptEntryId: tailLeaf,
      tokensBefore: 42,
    } as DraftEntry;
    const [compaction] = await storage.appendAtLeaf(SLUG, info.id, tailLeaf, [compactionDraft]);
    expect((compaction as CompactionEntry).type).toBe("compaction");

    const data = await storage.readSession(SLUG, info.id);
    const ctx = buildSessionContext(data!.entries, data!.leafId ?? undefined);
    expect(ctx.messages.length).toBeGreaterThan(0);
    const compactSummary = ctx.messages.find((m) => m.role === "compactionSummary");
    expect(compactSummary).toBeDefined();
  });
});

describe("listSessions", () => {
  test("returns session info entries sorted by modified desc", async () => {
    const a = await storage.createSession(SLUG, {});
    const b = await storage.createSession(SLUG, {});
    // Touch session b by appending an entry so it has a later activity time.
    await storage.appendAtLeaf(SLUG, b.id, null, [userDraft("touch")]);
    const sessions = await storage.listSessions(SLUG);
    expect(sessions.map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

// `_ctx` reserved for callers that want type narrowing on the message union.
function _ctxKeepUsed(_e: SessionMessageEntry) {}
void _ctxKeepUsed;
