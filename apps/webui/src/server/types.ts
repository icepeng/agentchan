// Domain types from creative-agent — imported once so they can be both
// re-exported and referenced locally (e.g. in ServerConfig).
import type {
  ContentBlock,
  StoredMessage,
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Conversation,
  ModelInfo,
  CustomApiFormat,
  ProviderInfo,
  CustomProviderDef,
  ThinkingLevel,
} from "@agentchan/creative-agent";

export type {
  ContentBlock,
  StoredMessage,
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Conversation,
  ModelInfo,
  CustomApiFormat,
  ProviderInfo,
  CustomProviderDef,
  ThinkingLevel,
};

// Service types (type-only — no runtime circular deps)
import type { ConfigService } from "./services/config.service.js";
import type { ProjectService } from "./services/project.service.js";
import type { ConversationService } from "./services/conversation.service.js";
import type { AgentService } from "./services/agent.service.js";
import type { LibraryService } from "./services/library.service.js";
import type { SkillService } from "./services/skill.service.js";

export type AppEnv = {
  Variables: {
    configService: ConfigService;
    projectService: ProjectService;
    conversationService: ConversationService;
    agentService: AgentService;
    libraryService: LibraryService;
    skillService: SkillService;
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

// --- Server config state ---

export interface ServerConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
}
