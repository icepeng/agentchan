/**
 * Two parallel rollups across per-call usage entries:
 *   - total*: summed across every API call this turn (cost, billing)
 *   - last*:  the most recent API call only — used to derive contextTokens
 *             for the context-window utilization indicator in the UI.
 *
 * Collapsing the two looks like a simplification but breaks the context
 * window display: totals over-count the window after multi-turn tool loops,
 * while contextTokens must reflect *only* the latest API call's footprint.
 */

import type { TokenUsage } from "../types.js";

export function summarizeTurnUsage(entries: TokenUsage[]): TokenUsage | undefined {
  if (entries.length === 0) return undefined;

  let totalInput = 0;
  let totalOutput = 0;
  let totalCachedInput = 0;
  let totalCacheCreation = 0;
  let totalCost = 0;
  for (const u of entries) {
    totalInput += u.inputTokens;
    totalOutput += u.outputTokens;
    totalCachedInput += u.cachedInputTokens ?? 0;
    totalCacheCreation += u.cacheCreationTokens ?? 0;
    totalCost += u.cost ?? 0;
  }

  const last = entries[entries.length - 1]!;
  const contextTokens =
    last.inputTokens +
    last.outputTokens +
    (last.cachedInputTokens ?? 0) +
    (last.cacheCreationTokens ?? 0);

  // Strip zero fields to match the wire shape the UI expects (it distinguishes
  // undefined vs 0 for cache/cost columns).
  const out: TokenUsage = {
    inputTokens: totalInput,
    outputTokens: totalOutput,
  };
  if (totalCachedInput) out.cachedInputTokens = totalCachedInput;
  if (totalCacheCreation) out.cacheCreationTokens = totalCacheCreation;
  if (totalCost) out.cost = totalCost;
  if (contextTokens > 0) out.contextTokens = contextTokens;
  return out;
}
