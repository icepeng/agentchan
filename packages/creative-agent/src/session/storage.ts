/**
 * JSONL session storage — Pi-compatible header + entry lines.
 *
 * - Branch is derived from leafId at read time, never persisted.
 * - Storage assigns id, parentId, timestamp; callers describe entries only.
 * - List/read scan whole files; index/manifest is intentionally absent.
 */

import { appendFile, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Message, TextContent } from "@mariozechner/pi-ai";

import { readSessionFile } from "./format.js";
import {
  CURRENT_SESSION_VERSION,
  type AgentchanSessionHeader,
  type AgentchanSessionInfo,
  type SessionEntry,
  type SessionEntryBase,
  type SessionMessageEntry,
  type SessionMode,
} from "./types.js";

// --- Public types ---

export interface SessionFileSnapshot {
  info: AgentchanSessionInfo;
  entries: SessionEntry[];
}

/** Caller-provided draft entry — storage assigns id, parentId, timestamp. */
export type DraftEntry =
  | Omit<SessionMessageEntry, keyof SessionEntryBase> & { type: "message" }
  | Omit<SessionEntry, keyof SessionEntryBase>;

export interface CreateSessionOpts {
  cwd?: string;
  mode?: SessionMode;
  parentSession?: string;
}

export interface SessionStorage {
  listSessions(slug: string): Promise<AgentchanSessionInfo[]>;
  readSession(slug: string, id: string, leafId?: string | null): Promise<{
    info: AgentchanSessionInfo;
    entries: SessionEntry[];
    leafId: string | null;
  } | null>;
  createSession(slug: string, opts?: CreateSessionOpts): Promise<AgentchanSessionInfo>;
  deleteSession(slug: string, id: string): Promise<void>;
  /**
   * Append entries as children of `leafId`. Storage assigns ids and links
   * each entry's parentId to the previous one in the array (first entry's
   * parent is `leafId`). Throws if `leafId` is non-null and not found.
   */
  appendAtLeaf(
    slug: string,
    sessionId: string,
    leafId: string | null,
    drafts: ReadonlyArray<DraftEntry>,
  ): Promise<SessionEntry[]>;
}

// --- Implementation ---

export function createSessionStorage(projectsDir: string): SessionStorage {
  const sessionsDir = (slug: string) => join(projectsDir, slug, "sessions");
  const sessionPath = (slug: string, id: string) =>
    join(sessionsDir(slug), `${id}.jsonl`);

  async function ensureDir(slug: string): Promise<void> {
    await mkdir(sessionsDir(slug), { recursive: true });
  }

  async function readWithStat(filePath: string): Promise<{
    snapshot: { header: AgentchanSessionHeader; entries: SessionEntry[] };
    modified: Date;
  } | null> {
    const snapshot = await readSessionFile(filePath);
    if (!snapshot) return null;
    let modified: Date;
    try {
      modified = (await stat(filePath)).mtime;
    } catch {
      modified = new Date();
    }
    return { snapshot, modified };
  }

  function buildInfo(
    filePath: string,
    header: AgentchanSessionHeader,
    entries: SessionEntry[],
    statsMtime: Date,
  ): AgentchanSessionInfo {
    let messageCount = 0;
    let firstMessageText = "";
    const allMessageTexts: string[] = [];
    let name: string | undefined;
    let lastEntryTimestamp: string | undefined;

    for (const entry of entries) {
      lastEntryTimestamp = entry.timestamp;
      if (entry.type === "session_info") {
        const trimmed = (entry).name?.trim();
        name = trimmed || undefined;
        continue;
      }
      if (entry.type !== "message") continue;
      messageCount++;
      const message = (entry).message;
      if (!message || typeof (message as { role?: unknown }).role !== "string") continue;
      if ((message as Message).role !== "user" && (message as Message).role !== "assistant") continue;
      const text = extractText(message as Message);
      if (!text) continue;
      allMessageTexts.push(text);
      if (!firstMessageText && (message as Message).role === "user") {
        firstMessageText = text;
      }
    }

    const created = new Date(header.timestamp);
    const modified = lastEntryTimestamp
      ? new Date(lastEntryTimestamp)
      : statsMtime;

    const id = header.id;
    const title = name ?? truncate(firstMessageText) ?? "New session";
    const mode: SessionMode = header.mode === "meta" ? "meta" : "creative";

    return {
      path: filePath,
      id,
      cwd: header.cwd ?? "",
      name,
      ...(header.parentSession ? { parentSessionPath: header.parentSession } : {}),
      created,
      modified,
      messageCount,
      firstMessage: firstMessageText || "(no messages)",
      allMessagesText: allMessageTexts.join(" "),
      mode,
      title,
    };
  }

  function generateEntryId(byId: Map<string, unknown>): string {
    for (let i = 0; i < 100; i++) {
      const id = randomUUID().slice(0, 8);
      if (!byId.has(id)) return id;
    }
    return randomUUID();
  }

  return {
    async listSessions(slug) {
      const dir = sessionsDir(slug);
      if (!existsSync(dir)) return [];
      const dirEntries = await readdir(dir);
      const files = dirEntries.filter((f) => f.endsWith(".jsonl"));
      const results = await Promise.all(
        files.map(async (file) => {
          const filePath = join(dir, file);
          const data = await readWithStat(filePath);
          if (!data) return null;
          return buildInfo(filePath, data.snapshot.header, data.snapshot.entries, data.modified);
        }),
      );
      return results
        .filter((s): s is AgentchanSessionInfo => s !== null)
        .sort((a, b) => b.modified.getTime() - a.modified.getTime());
    },

    async readSession(slug, id, leafId) {
      const filePath = sessionPath(slug, id);
      const data = await readWithStat(filePath);
      if (!data) return null;
      const { header, entries } = data.snapshot;
      const info = buildInfo(filePath, header, entries, data.modified);

      let resolved: string | null;
      if (leafId === undefined) {
        resolved = entries.length > 0 ? entries[entries.length - 1]!.id : null;
      } else if (leafId === null) {
        resolved = null;
      } else {
        if (!entries.some((e) => e.id === leafId)) {
          throw new Error(`Invalid leafId: ${leafId} not found in session ${id}`);
        }
        resolved = leafId;
      }
      return { info, entries, leafId: resolved };
    },

    async createSession(slug, opts = {}) {
      await ensureDir(slug);
      const id = randomUUID();
      const now = new Date().toISOString();
      const header: AgentchanSessionHeader = {
        type: "session",
        version: CURRENT_SESSION_VERSION,
        id,
        timestamp: now,
        cwd: opts.cwd ?? "",
        ...(opts.parentSession ? { parentSession: opts.parentSession } : {}),
        ...(opts.mode ? { mode: opts.mode } : {}),
      };
      const filePath = sessionPath(slug, id);
      await writeFile(filePath, JSON.stringify(header) + "\n");
      const stats = await stat(filePath);
      return buildInfo(filePath, header, [], stats.mtime);
    },

    async deleteSession(slug, id) {
      try {
        await unlink(sessionPath(slug, id));
      } catch {
        // ignore ENOENT
      }
    },

    async appendAtLeaf(slug, sessionId, leafId, drafts) {
      if (drafts.length === 0) return [];
      const filePath = sessionPath(slug, sessionId);
      const data = await readSessionFile(filePath);
      if (!data) {
        throw new Error(`Session not found: ${slug}/${sessionId}`);
      }
      const { entries } = data;

      // Validate leaf exists if specified.
      const byId = new Map<string, SessionEntry>();
      for (const e of entries) byId.set(e.id, e);
      if (leafId !== null && !byId.has(leafId)) {
        throw new Error(`Invalid leafId: ${leafId} not found in session ${sessionId}`);
      }

      // Issue ids and link parent chain.
      const persisted: SessionEntry[] = [];
      let parentId: string | null = leafId;
      const now = new Date().toISOString();
      for (const draft of drafts) {
        const entryId = generateEntryId(byId);
        const persistedEntry = {
          ...(draft as SessionEntry),
          id: entryId,
          parentId,
          timestamp: now,
        };
        persisted.push(persistedEntry);
        byId.set(entryId, persistedEntry);
        parentId = entryId;
      }

      // Append all lines in one write.
      const body = persisted.map((e) => JSON.stringify(e) + "\n").join("");
      await appendFile(filePath, body);
      return persisted;
    },
  };
}

// --- Helpers ---

function extractText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join(" ");
}

function truncate(text: string): string | undefined {
  const trimmed = text.trim().replace(/\n+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;
}
