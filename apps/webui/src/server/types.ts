// Domain types from creative-agent — imported once so they can be both
// re-exported and referenced locally (e.g. in ServerConfig).
import type {
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
import type { TemplateService } from "./services/template.service.js";
import type { SkillService } from "./services/skill.service.js";
import type { UpdateService } from "./services/update.service.js";

export type AppEnv = {
  Variables: {
    configService: ConfigService;
    projectService: ProjectService;
    conversationService: ConversationService;
    agentService: AgentService;
    templateService: TemplateService;
    skillService: SkillService;
    updateService: UpdateService;
  };
};

// --- Project (folder) - webui-specific ---

/** Disk format stored in _project.json (no slug — derived from folder name). */
export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

/** Runtime / API response format (slug derived from folder name on disk). */
export interface Project extends ProjectMeta {
  slug: string;
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
