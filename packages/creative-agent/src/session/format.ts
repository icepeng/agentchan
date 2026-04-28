/**
 * Session file IO + parse — Pi-compatible JSONL header + entry lines.
 *
 * No fs in here beyond what the storage layer needs; no LLM calls.
 * Pi's `parseSessionEntries` is reused verbatim — it tolerates unknown
 * header fields (single JSON.parse per line), so Agentchan's `mode`
 * extension on the header survives round-trip without custom parsing.
 */

import { readFile } from "node:fs/promises";
import {
  parseSessionEntries,
  migrateSessionEntries,
} from "@mariozechner/pi-coding-agent";

import type {
  AgentchanSessionHeader,
  SessionEntry,
} from "./types.js";

export interface ReadSessionFile {
  header: AgentchanSessionHeader;
  entries: SessionEntry[];
}

/** Read + parse + migrate a session file. Returns null if file missing or invalid. */
export async function readSessionFile(filePath: string): Promise<ReadSessionFile | null> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const fileEntries = parseSessionEntries(content);
  if (fileEntries.length === 0) return null;
  const header = fileEntries[0]!;
  if (header.type !== "session" || typeof (header as { id?: unknown }).id !== "string") {
    return null;
  }

  // In-place migrate to current version (mutates entries to new shape).
  migrateSessionEntries(fileEntries);

  // After migration, drop the header entry — header lives separately.
  const entries = fileEntries.slice(1) as SessionEntry[];
  return { header: header, entries };
}
