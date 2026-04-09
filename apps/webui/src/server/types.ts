// Re-export domain types from creative-agent
export type {
  ContentBlock,
  StoredMessage,
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Conversation,
} from "@agentchan/creative-agent";

// Service types (type-only — no runtime circular deps)
import type { ConfigService } from "./services/config.service.js";
import type { ProjectService } from "./services/project.service.js";
import type { ConversationService } from "./services/conversation.service.js";
import type { AgentService } from "./services/agent.service.js";
import type { LibraryService } from "./services/library.service.js";
import type { SkillService } from "./services/skill.service.js";
import type { SlashService } from "./services/slash.service.js";

export type AppEnv = {
  Variables: {
    configService: ConfigService;
    projectService: ProjectService;
    conversationService: ConversationService;
    agentService: AgentService;
    libraryService: LibraryService;
    skillService: SkillService;
    slashService: SlashService;
  };
};

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
  custom?: { url: string; format: CustomApiFormat };
}
