import { json } from "@/client/platform/index.js";
import type { ThinkingLevel } from "@agentchan/creative-agent/browser";

export interface ConfigResponse {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel: ThinkingLevel;
}

export function fetchConfig(): Promise<ConfigResponse> {
  return json("/config");
}

export function updateConfig(config: {
  provider?: string;
  model?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  contextWindow?: number | null;
  thinkingLevel?: ThinkingLevel | null;
}): Promise<ConfigResponse> {
  return json("/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}
