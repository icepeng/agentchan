import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createSessionStorage } from "../../src/session/storage.js";
import { branchFromLeaf, deriveSessionTitle } from "../../src/session/format.js";
import type { SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";

function entry(id: string, text: string): Omit<SessionMessageEntry, "parentId"> {
  const createdAt = Date.parse(`2026-04-26T00:00:0${id.slice(1)}.000Z`);
  return {
    type: "message",
    id,
    timestamp: new Date(createdAt).toISOString(),
    message: { role: "user", content: text, timestamp: Date.now() } as any,
  };
}

function ids(entries: readonly SessionEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

describe("SessionEntry storage", () => {
  test("writes pi header and SessionEntry lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a", undefined, "meta");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "root")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n2", "left")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n3", "right")]);

      const file = await readFile(join(dir, "project-a", "sessions", `${created.id}.jsonl`), "utf-8");
      const lines = file.trim().split("\n").map((line) => JSON.parse(line));

      expect(lines[0]).toMatchObject({
        type: "session",
        version: 3,
        id: created.id,
        mode: "meta",
      });
      expect(lines.slice(1).map((entry) => entry.type)).toEqual(["message", "message", "message"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("projects branch by requested leaf without persisting selection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "root")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n2", "left")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n3", "right")]);

      const left = await storage.loadSession("project-a", created.id, "n2");
      expect(left?.leafId).toBe("n2");
      expect(ids(branchFromLeaf(left?.entries ?? [], left?.leafId))).toEqual(["n1", "n2"]);

      const reloaded = await storage.loadSession("project-a", created.id);
      expect(reloaded?.leafId).toBe("n3");
      expect(ids(branchFromLeaf(reloaded?.entries ?? [], reloaded?.leafId))).toEqual(["n1", "n3"]);

      const file = await readFile(join(dir, "project-a", "sessions", `${created.id}.jsonl`), "utf-8");
      expect(file.trim().split("\n")).toHaveLength(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects invalid leaf ids on read and append", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "root")]);

      expect(await storage.loadSession("project-a", created.id, "missing")).toBeNull();
      await expect(
        storage.appendEntriesAtLeaf("project-a", created.id, "missing", [entry("n2", "orphan")]),
      ).rejects.toThrow("Session or leaf entry not found");

      const reloaded = await storage.loadSession("project-a", created.id);
      expect(reloaded?.entries.map((entry) => entry.id)).toEqual(["n1"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("appends compaction entry in the same session file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "root")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n2", "left")]);

      const result = await storage.appendCompaction("project-a", created.id, {
        summary: "summary",
        firstKeptEntryId: "n2",
        tokensBefore: 123,
      });

      const reloaded = await storage.loadSession("project-a", created.id, result.id);
      expect(reloaded?.leafId).toBe(result.id);
      const branch = branchFromLeaf(reloaded?.entries ?? [], reloaded?.leafId);
      expect(branch.map((entry) => entry.type)).toEqual(["message", "message", "compaction"]);
      expect(branch.at(-1)).toMatchObject({
        type: "compaction",
        parentId: "n2",
        summary: "summary",
        firstKeptEntryId: "n2",
        tokensBefore: 123,
      });

      const sessionsDir = join(dir, "project-a", "sessions");
      const files = await readdir(sessionsDir);
      expect(files).toEqual([`${created.id}.jsonl`]);

      const file = await readFile(join(sessionsDir, `${created.id}.jsonl`), "utf-8");
      const lines = file.trim().split("\n").map((line) => JSON.parse(line));
      expect(lines.at(-1).type).toBe("compaction");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("appends session_info for rename and exposes it through list and reload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "derived title")]);

      const renamed = await storage.appendSessionInfo("project-a", created.id, "n1", "  Named Session  ");
      expect(renamed).toMatchObject({
        type: "session_info",
        parentId: "n1",
        name: "Named Session",
      });

      const reloaded = await storage.loadSession("project-a", created.id);
      expect(deriveSessionTitle(reloaded?.entries ?? [])).toBe("Named Session");
      expect(reloaded?.leafId).toBe(renamed?.id);

      const listed = await storage.listSessions("project-a");
      expect(deriveSessionTitle(listed[0]?.entries ?? [])).toBe("Named Session");

      const file = await readFile(join(dir, "project-a", "sessions", `${created.id}.jsonl`), "utf-8");
      const lines = file.trim().split("\n").map((line) => JSON.parse(line));
      expect(lines.at(-1)).toMatchObject({
        type: "session_info",
        parentId: "n1",
        name: "Named Session",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("appends session_info at the requested leaf", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentchan-session-"));
    try {
      const storage = createSessionStorage(dir);
      const created = await storage.createSession("project-a");
      await storage.appendEntriesAtLeaf("project-a", created.id, null, [entry("n1", "root")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n2", "left")]);
      await storage.appendEntriesAtLeaf("project-a", created.id, "n1", [entry("n3", "right")]);

      const renamed = await storage.appendSessionInfo("project-a", created.id, "n2", "Left branch");
      if (!renamed) throw new Error("expected session_info entry");
      expect(renamed?.parentId).toBe("n2");

      const selected = await storage.loadSession("project-a", created.id, renamed?.id);
      expect(ids(branchFromLeaf(selected?.entries ?? [], selected?.leafId))).toEqual(["n1", "n2", renamed.id]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
