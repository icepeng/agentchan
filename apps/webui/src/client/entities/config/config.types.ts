export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
}

export type CustomApiFormat =
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai"
  | "openai-responses"
  | "mistral-conversations";

export type CustomApiTokenizer = "cl100k" | "o200k" | "claude" | "llama3" | "unknown";

export interface ProviderInfo {
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  // Custom provider fields (only present for user-defined providers)
  isCustom?: boolean;
  url?: string;
  format?: CustomApiFormat;
  tokenizer?: CustomApiTokenizer;
}

export interface CustomProviderDef {
  name: string;
  url: string;
  format: CustomApiFormat;
  tokenizer: CustomApiTokenizer;
  models: { id: string; name: string }[];
}

export type ThinkingLevel = "off" | "low" | "medium" | "high";
