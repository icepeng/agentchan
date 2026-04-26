/**
 * Pi-compatible JSONL session file format.
 *
 * Canonical persistence is a header line followed by Pi `SessionEntry` lines.
 */

import type { TextContent } from "@mariozechner/pi-ai";
import type {
  SessionEntry,
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import type {
  AgentchanSessionHeader,
} from "../types.js";
import { generateTitle } from "./tree.js";
import { parseSkillContent } from "../skills/skill-content.js";
import { formatSerializedCommandForDisplay } from "../slash/parse.js";

// --- Header ---

export type SessionMode = "creative" | "meta";

/** Pi session format version. Keep in sync with the compatible entry model. */
export const CURRENT_SESSION_VERSION = 3;

export type SessionHeader = AgentchanSessionHeader;

// --- Parsing ---

export interface ParsedSession {
  headerLine: string | null;
  header: SessionHeader | null;
  entries: SessionEntry[];
}

export function parseSessionFile(content: string): ParsedSession {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return { headerLine: null, header: null, entries: [] };
  }

  let headerLine: string | null = null;
  let header: SessionHeader | null = null;
  let startIdx = 0;

  const firstLine = lines[0];
  if (firstLine) {
    const first = JSON.parse(firstLine);
    if (first.type === "session") {
      headerLine = firstLine;
      header = { version: CURRENT_SESSION_VERSION, ...first } as SessionHeader;
      startIdx = 1;
    }
  }

  const entries: SessionEntry[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parsed = JSON.parse(line) as SessionEntry;
    if (!("id" in parsed) || !("parentId" in parsed) || !("timestamp" in parsed)) {
      continue;
    }
    entries.push(parsed);
  }

  return {
    headerLine,
    header,
    entries,
  };
}

// --- Entry graph helpers ---

export function buildEntryMap(entries: readonly SessionEntry[]): Map<string, SessionEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function defaultLeafId(entries: readonly SessionEntry[]): string | null {
  return entries[entries.length - 1]?.id ?? null;
}

export function branchFromLeaf(
  entries: readonly SessionEntry[],
  leafId?: string | null,
): SessionEntry[] {
  const byId = buildEntryMap(entries);
  const startId = leafId === undefined ? defaultLeafId(entries) : leafId;
  if (startId === null) return [];

  const branch: SessionEntry[] = [];
  let current = startId ? byId.get(startId) : undefined;
  while (current) {
    branch.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return branch;
}

function parseTimestamp(timestamp: string | undefined, fallback = Date.now()): number {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

// --- Helpers ---

function extractUserTextFromMessageEntry(entry: SessionMessageEntry): string {
  const msg = entry.message;
  if (msg.role !== "user") return "";
  if (typeof msg.content === "string") {
    const skillContent = parseSkillContent(msg.content);
    if (skillContent) {
      return skillContent.userMessage
        ? formatSerializedCommandForDisplay(skillContent.userMessage)
        : `/${skillContent.name}`;
    }
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter((b): b is TextContent => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const skillContent = parseSkillContent(text);
    return skillContent
      ? skillContent.userMessage
        ? formatSerializedCommandForDisplay(skillContent.userMessage)
        : `/${skillContent.name}`
      : text;
  }
  return "";
}

function latestSessionName(entries: readonly SessionEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "session_info") continue;
    const name = entry.name?.trim();
    return name || undefined;
  }
  return undefined;
}

function deriveProviderModel(entries: readonly SessionEntry[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.type === "model_change") {
      return { provider: entry.provider, model: entry.modelId };
    }
    if (entry.type === "message" && entry.message.role === "assistant") {
      return { provider: entry.message.provider ?? "", model: entry.message.model ?? "" };
    }
  }

  return { provider: "", model: "" };
}

// --- Derivation helpers: header + entries -> UI metadata ---

export function deriveSessionTitle(entries: readonly SessionEntry[]): string {
  const namedTitle = latestSessionName(entries);
  const firstUser = entries.find(
    (entry): entry is SessionMessageEntry =>
      entry.type === "message" && entry.message.role === "user",
  );
  return namedTitle
    ?? (firstUser ? generateTitle(extractUserTextFromMessageEntry(firstUser)) : "New session");
}

export function deriveSessionCreatedAt(
  header: SessionHeader | null,
  entries: readonly SessionEntry[],
): number {
  return parseTimestamp(header?.timestamp, parseTimestamp(entries[0]?.timestamp));
}

export function deriveSessionUpdatedAt(
  header: SessionHeader | null,
  entries: readonly SessionEntry[],
): number {
  const createdAt = deriveSessionCreatedAt(header, entries);
  return entries.length > 0
    ? parseTimestamp(entries[entries.length - 1]?.timestamp)
    : createdAt;
}

export function deriveSessionProviderModel(entries: readonly SessionEntry[]) {
  return deriveProviderModel(entries);
}

// --- Serialization ---

export function serializeEntries(
  headerLine: string | null,
  entries: readonly SessionEntry[],
): string {
  const entryContent = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const body = entryContent ? entryContent + "\n" : "";
  return headerLine ? headerLine + "\n" + body : body;
}
