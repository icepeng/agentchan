import { appendFile, readFile, mkdir, unlink, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { nanoid } from "nanoid";
import type {
  CompactionEntry,
  SessionEntry,
  SessionInfoEntry,
} from "@mariozechner/pi-coding-agent";
import {
  CURRENT_SESSION_VERSION,
  type SessionHeader,
  type SessionMode,
  type ParsedSession,
  parseSessionFile,
  deriveSessionUpdatedAt,
  defaultLeafId,
} from "./format.js";

type EntryWithoutParent<T extends SessionEntry = SessionEntry> = T extends SessionEntry
  ? Omit<T, "parentId">
  : never;

// --- Storage interface ---

export interface SessionStorage {
  // Session CRUD
  listSessions(projectSlug: string): Promise<Array<{ id: string; header: SessionHeader | null; entries: SessionEntry[] }>>;
  loadSession(projectSlug: string, id: string, leafId?: string | null): Promise<{
    header: SessionHeader | null;
    entries: SessionEntry[];
    leafId: string | null;
  } | null>;
  createSession(projectSlug: string, compactedFrom?: string, mode?: SessionMode): Promise<{ id: string; header: SessionHeader; entries: [] }>;
  deleteSession(projectSlug: string, id: string): Promise<void>;

  appendEntriesAtLeaf(
    projectSlug: string,
    sessionId: string,
    leafId: string | null,
    entries: EntryWithoutParent[],
  ): Promise<SessionEntry[]>;
  appendSessionInfo(
    projectSlug: string,
    sessionId: string,
    leafId: string | null,
    name: string,
  ): Promise<SessionInfoEntry | null>;
  appendCompaction<T = unknown>(
    projectSlug: string,
    sessionId: string,
    input: {
      leafId?: string | null;
      summary: string;
      firstKeptEntryId: string;
      tokensBefore: number;
      details?: T;
      fromHook?: boolean;
    },
  ): Promise<CompactionEntry>;
}

// --- JSONL Implementation ---

export function createSessionStorage(projectsDir: string): SessionStorage {
  // Path helpers
  function projectDir(projectSlug: string): string {
    return join(projectsDir, projectSlug);
  }

  function sessionsDir(projectSlug: string): string {
    return join(projectDir(projectSlug), "sessions");
  }

  function sessionPath(projectSlug: string, id: string): string {
    return join(sessionsDir(projectSlug), `${id}.jsonl`);
  }

  async function ensureSessionsDir(slug: string): Promise<void> {
    await mkdir(sessionsDir(slug), { recursive: true });
  }

  async function appendJsonLines(path: string, items: unknown[]): Promise<void> {
    const body = items.map((item) => JSON.stringify(item) + "\n").join("");
    await appendFile(path, body);
  }

  async function writeEntryLines(
    projectSlug: string,
    sessionId: string,
    entries: SessionEntry[],
  ): Promise<void> {
    await ensureSessionsDir(projectSlug);
    await appendJsonLines(sessionPath(projectSlug, sessionId), entries);
  }

  async function readFull(projectSlug: string, id: string): Promise<ParsedSession | null> {
    const path = sessionPath(projectSlug, id);
    try {
      const content = await readFile(path, "utf-8");
      return parseSessionFile(content);
    } catch {
      return null;
    }
  }

  function resolveLeafId(entries: readonly SessionEntry[], requestedLeafId?: string | null): string | null | undefined {
    if (requestedLeafId === undefined) return defaultLeafId(entries);
    if (requestedLeafId === null) return null;
    return entries.some((entry) => entry.id === requestedLeafId) ? requestedLeafId : undefined;
  }

  function withParents(drafts: readonly EntryWithoutParent[], leafId: string | null): SessionEntry[] {
    let parentId = leafId;
    return drafts.map((draft) => {
      const entry = { ...draft, parentId };
      parentId = entry.id;
      return entry;
    });
  }

  function toReadResult(
    data: ParsedSession,
    requestedLeafId?: string | null,
  ) {
    const leafId = resolveLeafId(data.entries, requestedLeafId);
    if (leafId === undefined) return null;
    return {
      header: data.header,
      entries: data.entries,
      leafId,
    };
  }

  return {
    async listSessions(projectSlug: string): Promise<Array<{ id: string; header: SessionHeader | null; entries: SessionEntry[] }>> {
      const dir = sessionsDir(projectSlug);
      if (!existsSync(dir)) return [];

      const entries = await readdir(dir);
      const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

      const results = await Promise.all(
        jsonlFiles.map(async (file) => {
          const id = basename(file, ".jsonl");
          const data = await readFull(projectSlug, id);
          if (!data) return null;
          return { id, header: data.header, entries: data.entries };
        }),
      );

      return results
        .filter((s): s is { id: string; header: SessionHeader | null; entries: SessionEntry[] } => s !== null)
        .sort((a, b) =>
          deriveSessionUpdatedAt(b.header, b.entries) - deriveSessionUpdatedAt(a.header, a.entries),
        );
    },

    async loadSession(projectSlug: string, id: string, leafId?: string | null) {
      const data = await readFull(projectSlug, id);
      if (!data) return null;
      return toReadResult(data, leafId);
    },

    async createSession(
      projectSlug: string,
      compactedFrom?: string,
      mode?: SessionMode,
    ): Promise<{ id: string; header: SessionHeader; entries: [] }> {
      await ensureSessionsDir(projectSlug);
      const id = nanoid(12);
      const now = Date.now();
      const timestamp = new Date(now).toISOString();

      const header: SessionHeader = {
        type: "session",
        version: CURRENT_SESSION_VERSION,
        id,
        timestamp,
        cwd: projectDir(projectSlug),
        ...(compactedFrom ? { parentSession: compactedFrom } : {}),
        ...(mode ? { mode } : {}),
      };
      await writeFile(sessionPath(projectSlug, id), JSON.stringify(header) + "\n");

      return {
        id,
        header,
        entries: [],
      };
    },

    async deleteSession(projectSlug: string, id: string): Promise<void> {
      try {
        await unlink(sessionPath(projectSlug, id));
      } catch { /* ignore ENOENT */ }
    },

    async appendEntriesAtLeaf(
      projectSlug: string,
      sessionId: string,
      leafId: string | null,
      drafts: EntryWithoutParent[],
    ) {
      const loaded = await this.loadSession(projectSlug, sessionId, leafId);
      if (!loaded) throw new Error("Session or leaf entry not found");
      if (drafts.length === 0) return [];

      const entries = withParents(drafts, loaded.leafId);
      await writeEntryLines(projectSlug, sessionId, entries);
      return entries;
    },

    async appendSessionInfo(
      projectSlug: string,
      sessionId: string,
      leafId: string | null,
      name: string,
    ) {
      const loaded = await this.loadSession(projectSlug, sessionId, leafId);
      if (!loaded) return null;

      const draft: EntryWithoutParent<SessionInfoEntry> = {
        type: "session_info",
        id: nanoid(12),
        timestamp: new Date().toISOString(),
        name: name.trim(),
      };

      const [entry] = await this.appendEntriesAtLeaf(projectSlug, sessionId, loaded.leafId, [draft]);
      return entry as SessionInfoEntry | undefined ?? null;
    },

    async appendCompaction<T = unknown>(
      projectSlug: string,
      sessionId: string,
      input: {
        leafId?: string | null;
        summary: string;
        firstKeptEntryId: string;
        tokensBefore: number;
        details?: T;
        fromHook?: boolean;
      },
    ) {
      const loaded = await this.loadSession(projectSlug, sessionId, input.leafId);
      if (!loaded) throw new Error("Session not found");

      const draft: EntryWithoutParent<CompactionEntry<T>> = {
        type: "compaction",
        id: nanoid(12),
        timestamp: new Date().toISOString(),
        summary: input.summary,
        firstKeptEntryId: input.firstKeptEntryId,
        tokensBefore: input.tokensBefore,
        ...(input.details !== undefined ? { details: input.details } : {}),
        ...(input.fromHook !== undefined ? { fromHook: input.fromHook } : {}),
      };

      const [entry] = await this.appendEntriesAtLeaf(projectSlug, sessionId, loaded.leafId, [draft]);
      if (!entry) throw new Error("Session not found after compaction append");
      return entry as CompactionEntry;
    },
  };
}
