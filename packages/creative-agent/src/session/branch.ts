/**
 * Branch derivation from leafId — pure functions over `SessionEntry[]`.
 */

import type { SessionEntry } from "./types.js";

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
