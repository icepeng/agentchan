/**
 * Lightweight context analysis — estimates token breakdown from the
 * normalized pi-ai Context (provider-agnostic).
 */

import type { Context } from "@mariozechner/pi-ai";
import { estimateTokens, estimateJsonTokens } from "@agentchan/estimate-tokens";

export interface ContextAnalysis {
  system: number;
  tools: number;
  messages: number;
  total: number;
  contextWindow: number;
}

/**
 * Analyze a pi-ai Context to estimate token distribution.
 * Works identically across all providers (Anthropic, OpenAI, Google, etc.)
 * since pi-ai normalizes the context before provider-specific conversion.
 */
export function analyzeContext(ctx: Context, contextWindow: number): ContextAnalysis {
  const system = ctx.systemPrompt ? estimateTokens(ctx.systemPrompt) : 0;
  const tools = estimateJsonTokens(ctx.tools);
  const messages = estimateJsonTokens(ctx.messages);

  return {
    system,
    tools,
    messages,
    total: system + tools + messages,
    contextWindow,
  };
}
