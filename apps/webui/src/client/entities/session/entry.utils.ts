import type { SessionEntry } from "@agentchan/creative-agent";

export function branchFromLeaf(
  entries: readonly SessionEntry[],
  leafId?: string | null,
): SessionEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const startId = leafId === undefined ? entries[entries.length - 1]?.id ?? null : leafId;
  if (startId === null) return [];

  const branch: SessionEntry[] = [];
  let current = byId.get(startId);
  while (current) {
    branch.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return branch;
}

export function appendEntriesUnique(
  entries: readonly SessionEntry[],
  toAppend: readonly SessionEntry[],
): SessionEntry[] {
  if (toAppend.length === 0) return [...entries];
  const seen = new Set(entries.map((entry) => entry.id));
  const next = [...entries];
  for (const entry of toAppend) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    next.push(entry);
  }
  return next;
}
