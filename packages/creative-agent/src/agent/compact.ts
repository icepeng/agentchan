/**
 * Tool result compaction for pi-ai messages.
 *
 * microCompact — replaces old tool results with `[Previous: used X]` placeholders.
 * Cache-aware: only advances compaction frontier when prompt cache has likely
 * expired (>5 min gap). Overflow is handled by Pi compaction entry flow.
 */

import type { Message, ToolResultMessage, AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@agentchan/estimate-tokens";
import * as log from "../logger.js";

const KEEP_RECENT_TOKENS = 40_000;
const CACHE_TTL_MS = 5 * 60_000;

// ── micro-compact ──────────────────────────────────────────────────

/**
 * Per-session: [compacted count, last call timestamp].
 * Count only increases — when cache expires or context is full.
 * This keeps the prompt prefix stable between API calls.
 */
const state = new Map<string, [count: number, ms: number]>();

export function clearCompactState(id: string): void { state.delete(id); }

export interface MicroCompactOptions {
  sessionId: string;
  protectFromIndex: number;
  keepRecentTokens?: number;
}

export function microCompact(
  messages: AgentMessage[],
  { sessionId: id, protectFromIndex: limit, keepRecentTokens }: MicroCompactOptions,
): AgentMessage[] {
  const refs = scanToolResults(messages, limit);
  const [prev = 0, prevMs = 0] = state.get(id) ?? [];
  const budget = keepRecentTokens ?? KEEP_RECENT_TOKENS;
  const keepCount = computeKeepCount(refs, budget);
  const target = Math.max(0, refs.length - keepCount);

  let n = prev;
  if (target > prev) {
    const expired = !prevMs || Date.now() - prevMs > CACHE_TTL_MS;
    if (expired) {
      n = target;
      log.debug("agent", `compact frontier ${prev} → ${n}`);
    }
  }

  state.set(id, [n, Date.now()]);
  return replaceToolResults(messages, refs, Math.max(1, refs.length - n));
}

// ── helpers (shared by micro & full compact) ───────────────────────

interface Ref { id: string; tokens: number }

function scanToolResults(messages: AgentMessage[], limit: number): Ref[] {
  const out: Ref[] = [];
  for (let i = 0; i < Math.min(messages.length, limit); i++) {
    const m = messages[i] as Message;
    if (m.role !== "toolResult") continue;
    const tr = m as ToolResultMessage;
    let tokens = 0;
    for (const c of tr.content) {
      if ("text" in c) tokens += estimateTokens(c.text);
    }
    out.push({ id: tr.toolCallId, tokens });
  }
  return out;
}

/** Walk refs newest→oldest, accumulate tokens until budget exceeded. */
function computeKeepCount(refs: Ref[], budget: number): number {
  let tokens = 0;
  let keep = 0;
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i];
    if (!ref) continue;
    const next = tokens + ref.tokens;
    if (next > budget && keep > 0) break;
    tokens = next;
    keep++;
  }
  return Math.max(1, keep);
}

function replaceToolResults(
  messages: AgentMessage[],
  refs: Ref[],
  keep: number,
): AgentMessage[] {
  if (refs.length <= keep) return messages;

  const drop = new Set(refs.slice(0, -keep).map((r) => r.id));
  if (drop.size === 0) return messages;

  const names = new Map<string, string>();
  for (const m of messages) {
    if ((m as Message).role === "assistant") {
      for (const b of (m as AssistantMessage).content) {
        if (b.type === "toolCall") names.set(b.id, b.name);
      }
    }
  }

  log.debug("agent", `compacted ${drop.size} of ${messages.length} tool results`);

  return messages.map((m) => {
    if ((m as Message).role !== "toolResult") return m;
    const tr = m as ToolResultMessage;
    if (!drop.has(tr.toolCallId)) return m;
    const name = names.get(tr.toolCallId) ?? "unknown";
    return { ...tr, content: [{ type: "text" as const, text: `[Previous: used ${name}]` }] };
  });
}
