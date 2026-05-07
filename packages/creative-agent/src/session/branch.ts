/**
 * Branch derivation from leafId — pure functions over `SessionEntry[]`.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionEntry, SessionMessageEntry } from "./types.js";

/** Walk leaf → root by parentId. Returns the path in root-to-leaf order. Throws on invalid leafId. */
export function branchFromLeaf(
  entries: ReadonlyArray<SessionEntry>,
  leafId: string,
): SessionEntry[] {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);
  const start = byId.get(leafId);
  if (!start) {
    throw new Error(`Invalid leafId: ${leafId} not found in entries`);
  }
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = start;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** UI projection: root-to-leaf branch, or [] when there is no active leaf. */
export function selectBranch(
  entries: ReadonlyArray<SessionEntry>,
  leafId: string | null,
): SessionEntry[] {
  if (!leafId) return [];
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  const start = byId.get(leafId);
  if (!start) return [];
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = start;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Default leaf for opening a session without explicit selection: the last appended entry. */
export function defaultLeafId(entries: ReadonlyArray<SessionEntry>): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1]!.id;
}

/** Sibling ids of an entry — entries that share the same parentId, in append order. */
export function siblingsOf(
  entries: ReadonlyArray<SessionEntry>,
  entryId: string,
): string[] {
  const target = entries.find((e) => e.id === entryId);
  if (!target) return [entryId];
  return entries
    .filter((e) => e.parentId === target.parentId)
    .map((e) => e.id);
}

/** UI alias for sibling lookup. */
export const selectSiblings = siblingsOf;

/**
 * Single-pass sibling index for render paths that need lookup for many
 * entries. Sibling ids preserve append order.
 */
export function buildSiblingsByEntry(
  entries: ReadonlyArray<SessionEntry>,
): Map<string, string[]> {
  const byParent = new Map<string | null, string[]>();
  for (const entry of entries) {
    const siblings = byParent.get(entry.parentId);
    if (siblings) siblings.push(entry.id);
    else byParent.set(entry.parentId, [entry.id]);
  }

  const byEntry = new Map<string, string[]>();
  for (const entry of entries) {
    byEntry.set(entry.id, byParent.get(entry.parentId) ?? [entry.id]);
  }
  return byEntry;
}

/** Message entries along an already-selected Session entry list. */
export function selectMessageEntries(
  entries: ReadonlyArray<SessionEntry>,
): SessionMessageEntry[] {
  return entries.filter(
    (entry): entry is SessionMessageEntry => entry.type === "message",
  );
}

/** Messages visible to client AgentState hydration. */
export function selectVisibleMessages(
  entries: ReadonlyArray<SessionEntry>,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (const entry of selectMessageEntries(entries)) {
    const message = entry.message;
    if (
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult"
    ) {
      messages.push(message);
    }
  }
  return messages;
}

/** Messages visible on one selected Branch. */
export function selectBranchMessages(
  entries: ReadonlyArray<SessionEntry>,
  leafId: string | null,
): AgentMessage[] {
  return selectVisibleMessages(selectBranch(entries, leafId));
}
