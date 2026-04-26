import type { SessionEntry } from "@/client/entities/session/index.js";

export function branchUntil(
  branch: ReadonlyArray<SessionEntry>,
  entryId: string | null,
): ReadonlyArray<SessionEntry> {
  if (!entryId) return [];
  const index = branch.findIndex((entry) => entry.id === entryId);
  return index >= 0 ? branch.slice(0, index + 1) : branch;
}

export function branchWithAppendedEntry(
  entries: ReadonlyArray<SessionEntry>,
  branch: ReadonlyArray<SessionEntry>,
  entry: SessionEntry,
): SessionEntry[] {
  if (branch.some((existing) => existing.id === entry.id)) return branch as SessionEntry[];
  if (!entry.parentId) return [entry];
  const parentIndex = branch.findIndex((existing) => existing.id === entry.parentId);
  if (parentIndex >= 0) return [...branch.slice(0, parentIndex + 1), entry];

  const byId = new Map(entries.map((existing) => [existing.id, existing]));
  const path: SessionEntry[] = [];
  for (let id: string | null = entry.parentId; id;) {
    const parent = byId.get(id);
    if (!parent) return [...branch, entry];
    path.push(parent);
    id = parent.parentId;
  }
  path.reverse();
  path.push(entry);
  return path;
}
