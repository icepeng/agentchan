/**
 * Session file IO + parse — Pi-compatible JSONL header + entry lines.
 *
 * Agentchan reads/writes v3 only (ADR-0010). Files with a non-v3 header are
 * rejected so unknown formats don't silently appear as headerless entries.
 */

import { readFile } from "node:fs/promises";

import { parseSessionEntries } from "./parse.js";
import {
  CURRENT_SESSION_VERSION,
  type AgentchanSessionHeader,
  type SessionEntry,
} from "./types.js";

export interface ReadSessionFile {
  header: AgentchanSessionHeader;
  entries: SessionEntry[];
}

/** Read + parse a v3 session file. Returns null if missing, malformed, or non-v3. */
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
  if ((header as AgentchanSessionHeader).version !== CURRENT_SESSION_VERSION) {
    return null;
  }

  const entries = fileEntries.slice(1) as SessionEntry[];
  return { header: header as AgentchanSessionHeader, entries };
}
