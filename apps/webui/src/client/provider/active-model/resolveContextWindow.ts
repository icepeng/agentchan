import type { ModelInfo } from "@agentchan/creative-agent/browser";
import type { ConfigResponse } from "./config.api.js";

export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_TOKENS = 16_000;

export function resolveContextWindow(active: {
  config?: Pick<ConfigResponse, "contextWindow">;
  modelInfo?: Pick<ModelInfo, "contextWindow">;
}): number {
  return active.config?.contextWindow ?? active.modelInfo?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}
