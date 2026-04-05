// Re-export domain types from creative-agent
export type {
  ContentBlock,
  StoredMessage,
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Conversation,
} from "@agentchan/creative-agent";

// --- Project (folder) - webui-specific ---

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  outputDir?: string;      // Output directory path (default: "output/")
  notes?: string;          // Free-form project notes
}

// --- Output file (for renderer system) ---

export interface OutputFile {
  path: string;        // Relative path within outputDir
  content: string;     // File content
  modifiedAt: number;  // Last modified timestamp
}

// --- Custom provider ---

export type CustomApiFormat =
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai"
  | "openai-responses"
  | "mistral-conversations";

export interface CustomProviderDef {
  name: string;
  url: string;
  format: CustomApiFormat;
  models: { id: string; name: string }[];
}

// --- Server config state ---

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface ServerConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
}

// --- Provider / model info ---

export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
}

export interface ProviderInfo {
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  // Custom provider fields (only present for user-defined providers)
  isCustom?: boolean;
  url?: string;
  format?: CustomApiFormat;
}
