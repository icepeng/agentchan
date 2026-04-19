// Provider/model/config shape types — single source of truth shared by webui server and client.

export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
  /** Model's max input context (tokens). Absent for custom providers. */
  contextWindow?: number;
  /** Model's max single-turn output (tokens). Absent for custom providers. */
  maxTokens?: number;
}

export type CustomApiFormat =
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai"
  | "openai-responses"
  | "mistral-conversations";

export interface ProviderInfo {
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  custom?: { url: string; format: CustomApiFormat };
  /** Provider uses OAuth subscription (login flow) instead of API key input. */
  oauth?: boolean;
}

export interface CustomProviderDef {
  name: string;
  url: string;
  format: CustomApiFormat;
  models: { id: string; name: string }[];
}

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";
