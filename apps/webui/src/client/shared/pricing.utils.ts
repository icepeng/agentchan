/**
 * Pricing utilities — costs are now calculated server-side by pi-ai
 * from actual model pricing data. This module only provides formatters.
 *
 * Token estimation is canonical in @agentchan/estimate-tokens
 * and re-exported here for client convenience.
 */

export { estimateTokens, formatTokens } from "@agentchan/estimate-tokens";

export type { TokenUsage } from "@agentchan/creative-agent";

export function formatCost(cost: number | null | undefined): string {
  if (cost == null) return "~?";
  if (cost < 0.01) return "<$0.01";
  return `~$${cost.toFixed(2)}`;
}
