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

export interface ProviderInfo {
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  custom?: { url: string; format: CustomApiFormat };
}

export interface CustomProviderDef {
  name: string;
  url: string;
  format: CustomApiFormat;
  models: { id: string; name: string }[];
}

export type ThinkingLevel = "off" | "low" | "medium" | "high";
