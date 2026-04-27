import type { SessionEntry } from "./session.types.js";

/**
 * Splice entries into the array, replacing any existing entry with the same
 * id (idempotent for stream replays). Append in order — the server is the
 * source of truth for parentId, so we trust whatever it sends.
 */
export function insertEntries(
  entries: ReadonlyArray<SessionEntry>,
  toInsert: ReadonlyArray<SessionEntry>,
): SessionEntry[] {
  if (toInsert.length === 0) return [...entries];
  const seen = new Map<string, SessionEntry>();
  for (const e of toInsert) seen.set(e.id, e);
  const out: SessionEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.id)) {
      out.push(seen.get(e.id)!);
      seen.delete(e.id);
    } else {
      out.push(e);
    }
  }
  for (const e of seen.values()) out.push(e);
  return out;
}

/**
 * Swap a temp (optimistic) entry id for the real one the server echoed back.
 * Re-points any entries whose `parentId` referenced the temp id.
 */
export function replaceTempEntry(
  entries: ReadonlyArray<SessionEntry>,
  tempId: string,
  real: SessionEntry,
): SessionEntry[] {
  const out: SessionEntry[] = [];
  let appended = false;
  for (const e of entries) {
    if (e.id === tempId) {
      out.push(real);
      appended = true;
      continue;
    }
    if (e.parentId === tempId) {
      out.push({ ...e, parentId: real.id });
    } else {
      out.push(e);
    }
  }
  if (!appended) out.push(real);
  return out;
}
