import type { Message } from "@mariozechner/pi-ai";
import type {
  AgentchanSessionInfo,
  SessionEntry,
  SessionMessageEntry,
} from "@agentchan/creative-agent";

/** root → leaf branch by following parentId from leafId. Returns [] for null leaf. */
export function selectBranch(
  entries: ReadonlyArray<SessionEntry>,
  leafId: string | null,
): SessionEntry[] {
  if (!leafId) return [];
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = byId.get(leafId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** Sibling ids of an entry (entries that share parentId). */
export function selectSiblings(
  entries: ReadonlyArray<SessionEntry>,
  entryId: string,
): string[] {
  const target = entries.find((e) => e.id === entryId);
  if (!target) return [entryId];
  return entries
    .filter((e) => e.parentId === target.parentId)
    .map((e) => e.id);
}

/**
 * Single-pass index for sibling lookup. Use when rendering many bubbles —
 * `selectSiblings` is O(N) per call; this prebuild is O(N) total.
 */
export function buildSiblingsByEntry(
  entries: ReadonlyArray<SessionEntry>,
): Map<string, string[]> {
  const byParent = new Map<string | null, string[]>();
  for (const e of entries) {
    const arr = byParent.get(e.parentId);
    if (arr) arr.push(e.id);
    else byParent.set(e.parentId, [e.id]);
  }
  const byEntry = new Map<string, string[]>();
  for (const e of entries) {
    byEntry.set(e.id, byParent.get(e.parentId) ?? [e.id]);
  }
  return byEntry;
}

/**
 * Visible Pi messages along a branch — used by hydrate paths that hand the
 * agent-state reducer a clean message stream. Filters down to plain
 * message entries; compaction/session_info markers don't replay.
 */
export function selectMessageEntries(
  branch: ReadonlyArray<SessionEntry>,
): SessionMessageEntry[] {
  return branch.filter(
    (e): e is SessionMessageEntry => e.type === "message",
  );
}

/** Default: the last appended entry id, or null for empty session. */
export function defaultLeafId(entries: ReadonlyArray<SessionEntry>): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1]!.id;
}

/**
 * Most recent creative session id from a server-sorted list, or null if no
 * creative session exists. Server lists `modified desc` (ADR-0004), so the
 * first creative entry is the right default — meta sessions are skipped per
 * ADR-0005's "meta is an explicit auxiliary workspace".
 */
export function pickDefaultCreativeSessionId(
  sessions: ReadonlyArray<AgentchanSessionInfo>,
): string | null {
  return sessions.find((s) => s.mode === "creative")?.id ?? null;
}

/** Pi `Message[]` for the agent-state hydrate stream. */
export function selectBranchMessages(
  entries: ReadonlyArray<SessionEntry>,
  leafId: string | null,
): Message[] {
  const branch = selectBranch(entries, leafId);
  const out: Message[] = [];
  for (const entry of selectMessageEntries(branch)) {
    const msg = entry.message;
    const role = (msg as Message).role;
    if (role === "user" || role === "assistant" || role === "toolResult") {
      out.push(msg as Message);
    }
  }
  return out;
}
