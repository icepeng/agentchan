// Skills
export { discoverProjectSkills } from "./skills/discovery.js";
export type { SkillMetadata, SkillEnvironment } from "./skills/types.js";

// Slash command parsing
export { parseSlashInput } from "./slash/parse.js";

// Slug utility
export { slugify } from "./slug.js";

// Types
export type {
  AgentMessage,
  AssistantMessage,
  CompactionEntry,
  ImageContent,
  Message,
  SessionEntry,
  SessionEntryBase,
  SessionInfoEntry,
  SessionMessageEntry,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
  AgentchanSessionHeader,
} from "./types.js";
export type { ModelInfo, CustomApiFormat, ProviderInfo, CustomProviderDef, ThinkingLevel } from "./config-types.js";
export { DEFAULT_THINKING_LEVEL } from "./config-types.js";

// Agent — orchestrator
export {
  getSkills,
  resolveModel,
} from "./agent/orchestrator.js";

// Re-export pi-agent-core types needed by consumers
export type { AgentEvent } from "@mariozechner/pi-agent-core";

// Session — storage
export type {
  SessionStorage,
  SessionMode,
} from "./session/index.js";
export {
  createSessionStorage,
  deriveSessionCreatedAt,
  deriveSessionProviderModel,
  deriveSessionTitle,
  deriveSessionUpdatedAt,
} from "./session/index.js";

// Agent — context, config, and LLM-touching ops
export {
  createAgentContext,
  createSession,
  deleteSession,
  compactSession,
  runPrompt,
  runRegenerate,
  type AgentContext,
  type ResolvedAgentConfig,
  type SessionEvent,
} from "./agent/index.js";

// Workspace
export type { ProjectFile, TextFile, DataFile, BinaryFile } from "./workspace/types.js";
export { scanWorkspaceFiles } from "./workspace/scan.js";
export { parseFrontmatter, stringifyFrontmatter, type ParsedFrontmatter } from "./workspace/frontmatter.js";

// Renderer V1 build contract
export {
  buildRendererBundle,
  findRendererEntrypoint,
  validateRendererImportPolicy,
  createRendererRuntimePlugin,
  createRendererSourcePlugin,
  RendererV1Error,
  RendererBuildError,
  type RendererBundle,
  type RendererV1ErrorPhase,
} from "./renderer/index.js";

// Re-export pi-ai model registry functions for consumers (webui config)
export { getProviders, getModels } from "@mariozechner/pi-ai";
