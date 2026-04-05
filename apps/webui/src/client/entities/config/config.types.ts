export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
}

export interface ProviderInfo {
  name: string;
  defaultModel: string;
  models: ModelInfo[];
}

export type ThinkingLevel = "off" | "low" | "medium" | "high";
