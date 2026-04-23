// Domain types from creative-agent — imported once so they can be both
// re-exported and referenced locally (e.g. in ServerConfig).
import type {
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Session,
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
  Session,
  ModelInfo,
  CustomApiFormat,
  ProviderInfo,
  CustomProviderDef,
  ThinkingLevel,
};

// Service types (type-only — no runtime circular deps)
import type { ConfigService } from "./services/config.service.js";
import type { ProjectService } from "./services/project.service.js";
import type { SessionService } from "./services/session.service.js";
import type { AgentService } from "./services/agent.service.js";
import type { TemplateService } from "./services/template.service.js";
import type { SkillService } from "./services/skill.service.js";
import type { UpdateService } from "./services/update.service.js";
import type { StateService } from "./services/state.service.js";
import type { ActionsService } from "./services/actions.service.js";
import type { ProjectConfigService } from "./services/project-config.service.js";

export type AppEnv = {
  Variables: {
    configService: ConfigService;
    projectService: ProjectService;
    sessionService: SessionService;
    agentService: AgentService;
    templateService: TemplateService;
    skillService: SkillService;
    updateService: UpdateService;
    stateService: StateService;
    actionsService: ActionsService;
    projectConfigService: ProjectConfigService;
  };
};

// --- Project (folder) - webui-specific ---

/** Disk format stored in _project.json (no slug — derived from folder name). */
export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  /**
   * Declarative permission surface for the sandboxed renderer iframe. The
   * `allowedDomains` list is folded into the CSP headers on every renderer
   * response; an absent field or empty list yields a self-only policy.
   */
  renderer?: {
    allowedDomains?: string[];
  };
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
  thinkingLevel: ThinkingLevel;
}
