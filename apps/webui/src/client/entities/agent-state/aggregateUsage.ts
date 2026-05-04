import type { Message } from "@mariozechner/pi-ai";
import type { SessionMessageEntry } from "@/client/entities/session/index.js";

/**
 * Token + cost totals over a set of assistant **Session entry**s. Shared
 * deep module for **Session usage** and **Turn usage** derive views — only
 * the input set differs.
 */
export interface AggregatedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
}

export const EMPTY_AGGREGATED_USAGE: AggregatedUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
};

/**
 * Sum **Usage** across the assistant entries in `entries`. Non-assistant
 * entries (user, toolResult) and assistant entries without recorded
 * **Usage** contribute zero. Caller decides the input scope —
 * **Session usage** passes whole-session entries, **Turn usage** passes
 * one **Turn**'s entries.
 *
 * NOTE: `CompactionEntry` makes an LLM call but has no `usage` field in
 * the schema, so its tokens/cost are excluded — **Session usage** drifts
 * from the provider's billed total whenever compaction has run.
 */
export function aggregateUsage(
  entries: ReadonlyArray<SessionMessageEntry>,
): AggregatedUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let cost = 0;

  for (const entry of entries) {
    const msg = entry.message as Message;
    if (msg.role !== "assistant") continue;
    const u = msg.usage;
    if (!u) continue;
    inputTokens += u.input ?? 0;
    outputTokens += u.output ?? 0;
    cachedInputTokens += u.cacheRead ?? 0;
    cacheCreationTokens += u.cacheWrite ?? 0;
    cost += u.cost?.total ?? 0;
  }

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    cost,
  };
}
