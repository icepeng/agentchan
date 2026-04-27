/**
 * Tool result compaction for pi-ai messages.
 *
 * microCompact — replaces old tool results with `[Previous: used X]` placeholders.
 * Cache-aware: only advances compaction frontier when prompt cache has likely
 * expired (>5 min gap). Overflow is a separate concern (fullCompact / gate).
 *
 * fullCompact — LLM-based conversation summarization for session handoff.
 */

import { completeSimple, type Model, type Api } from "@mariozechner/pi-ai";
import type { Message, ToolResultMessage, AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens, formatTokens } from "@agentchan/estimate-tokens";
import type { SessionMessageEntry } from "../session/index.js";
import * as log from "../logger.js";

export const KEEP_RECENT_TOKENS = 40_000;
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

// ── full compact ───────────────────────────────────────────────────

const COMPACT_SYSTEM_PROMPT = `You are a creative AI assistant tasked with summarizing conversations. Do NOT continue the conversation. Respond with TEXT ONLY.`;

const COMPACT_SUMMARY_REQUEST = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools. Tool calls will be REJECTED. Your entire response must be an <analysis> block followed by a <summary> block.

Your task is to create a detailed summary of the conversation so far, paying close attention to the user's creative requests and the assistant's actions.
This summary will be placed at the start of a new session to preserve context. Summarize thoroughly so that someone reading only your summary can fully understand what happened and continue the creative work.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts. In your analysis:

1. Chronologically analyze each section of the conversation. For each section identify:
   - The user's explicit requests and creative direction
   - The assistant's approach and creative choices
   - Key decisions on narrative, characters, world-building, tone, and style
   - Specific details: file names, written content excerpts, character traits, plot points
   - Issues encountered and how they were resolved
   - Pay special attention to user feedback, especially corrections or changed creative direction
2. Double-check for accuracy and completeness.

Your summary should include the following sections:

1. Creative Direction: Capture the user's goals — what they are building, the genre, tone, and creative vision.
2. Characters and World: List characters (names, traits, relationships, voice) and world-building details established so far.
3. Written Content: Enumerate files created or modified. Include key excerpts and describe why each matters to the project.
4. Style and Constraints: Document agreed-upon writing style, tone, POV, formatting rules, and any constraints the user specified.
5. All User Messages: List ALL user messages that are not tool results. These are critical for understanding feedback and changing intent.
6. Pending Tasks: Outline any pending creative tasks explicitly asked to work on.
7. Current Work: Describe precisely what was being worked on immediately before this summary, with file names and details.
8. Context for Continuation: Summarize decisions, narrative state, and context needed to continue. Include direct quotes from recent conversation showing the last task and where it left off.

Format your output as:

<analysis>
[Your thorough analysis]
</analysis>

<summary>
1. Creative Direction:
   [Detailed description]

2. Characters and World:
   - [Character/element 1]
   - [...]

3. Written Content:
   - [File/Content 1]
     - [Why important]
     - [Key excerpt]
   - [...]

4. Style and Constraints:
   - [Rule/decision 1]
   - [...]

5. All User Messages:
   - [Message 1]
   - [...]

6. Pending Tasks:
   - [Task 1]
   - [...]

7. Current Work:
   [Precise description]

8. Context for Continuation:
   [Key context and decisions needed]
</summary>`;

export function formatCompactSummary(raw: string): string {
  let result = raw;
  result = result.replace(/<analysis>[\s\S]*?<\/analysis>/i, "");

  const closedMatch = result.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (closedMatch?.[1]?.trim()) {
    result = closedMatch[1].trim();
  } else {
    const openMatch = result.match(/<summary>([\s\S]*)/i);
    if (openMatch?.[1]?.trim()) {
      result = openMatch[1].trim();
    }
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export interface FullCompactOptions {
  messages: Message[];
  model: Model<Api>;
  apiKey: string;
}

export interface FullCompactResult {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export async function fullCompact(options: FullCompactOptions): Promise<FullCompactResult> {
  const { model, apiKey } = options;
  const msgs = options.messages as AgentMessage[];
  const refs = scanToolResults(msgs, msgs.length);
  const keepCount = computeKeepCount(refs, KEEP_RECENT_TOKENS);
  const compacted = replaceToolResults(msgs, refs, keepCount) as Message[];

  log.info("agent", `full compact: ${compacted.length} messages → summarizing with ${model.id}`);

  const response = await completeSimple(model, {
    systemPrompt: COMPACT_SYSTEM_PROMPT,
    messages: [...compacted, {
      role: "user",
      content: [{ type: "text", text: COMPACT_SUMMARY_REQUEST }],
      timestamp: Date.now(),
    } satisfies Message],
  }, { apiKey, maxTokens: model.maxTokens });

  const rawText = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const summary = formatCompactSummary(rawText);
  if (!summary) {
    throw new Error("Compact summary is empty — the model response did not contain extractable summary content");
  }

  log.info("agent", `full compact done: ${formatTokens(response.usage.input)} in + ${formatTokens(response.usage.output)} out, $${response.usage.cost.total.toFixed(4)}`);

  return {
    summary,
    inputTokens: response.usage.input,
    outputTokens: response.usage.output,
    cost: response.usage.cost.total,
  };
}

// ── compaction cutpoint ────────────────────────────────────────────

/**
 * Walk the branch newest → oldest and pick the oldest entry whose tail
 * (from this entry to the leaf) still fits the keep budget. That entry's
 * id is the `firstKeptEntryId` for a CompactionEntry: Pi's
 * `buildSessionContext` will emit the summary once and replay every
 * entry from this id forward.
 *
 * Mirrors Pi's `findCutPoint` (see `pi-mono/.../compaction.ts:386`) over
 * our SessionMessageEntry shape. Returns the oldest entry's id when the
 * whole branch fits within the budget — caller can decide whether to
 * skip compaction in that case.
 */
export function computeCompactionCutpoint(
  entries: ReadonlyArray<SessionMessageEntry>,
  keepRecentTokens: number = KEEP_RECENT_TOKENS,
): string {
  if (entries.length === 0) {
    throw new Error("computeCompactionCutpoint: empty entries");
  }
  let tokens = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    tokens += entryTokens(entry);
    if (tokens >= keepRecentTokens) {
      return entry.id;
    }
  }
  return entries[0]!.id;
}

function entryTokens(entry: SessionMessageEntry): number {
  const msg = entry.message as Message;
  if (msg.role === "user") {
    const c = msg.content;
    if (typeof c === "string") return estimateTokens(c);
    let n = 0;
    for (const b of c) if (b.type === "text") n += estimateTokens(b.text);
    return n;
  }
  if (msg.role === "assistant") {
    let n = 0;
    for (const b of msg.content) {
      if (b.type === "text") n += estimateTokens(b.text);
      else if (b.type === "thinking") n += estimateTokens(b.thinking ?? "");
      else if (b.type === "toolCall")
        n += estimateTokens(JSON.stringify(b.arguments ?? {}));
    }
    return n;
  }
  if (msg.role === "toolResult") {
    let n = 0;
    for (const b of msg.content) {
      if ("text" in b && typeof b.text === "string") n += estimateTokens(b.text);
    }
    return n;
  }
  return 0;
}
