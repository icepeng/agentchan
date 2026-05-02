// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * JSONL line parsing — pure string-in / entries-out. No fs, no migration.
 * Malformed lines are silently dropped so a partially-corrupt tail still
 * yields a usable prefix.
 */

import type { CompactionEntry, FileEntry, SessionEntry } from "./types.js";

/** Parse JSONL session content. Skips blank/malformed lines. */
export function parseSessionEntries(content: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const lines = content.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as FileEntry);
    } catch {
      // Skip malformed lines.
    }
  }
  return entries;
}

/** Walk entries in reverse, return the most recent compaction or null. */
export function getLatestCompactionEntry(
  entries: SessionEntry[],
): CompactionEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.type === "compaction") {
      return entries[i] as CompactionEntry;
    }
  }
  return null;
}
