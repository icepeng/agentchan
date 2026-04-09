/**
 * Resolved agent runtime config — produced by the consumer (e.g. webui pulls
 * provider/model/keys from app settings) and consumed by every agent function.
 */
export interface ResolvedAgentConfig {
  provider: string;
  model: string;
  /** Empty string allowed for custom providers (e.g. local Ollama). */
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  baseUrl?: string;
  apiFormat?: string;
}
