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
  Message,
  ProjectSessionInfo,
  ProjectSessionState,
  SessionEntry,
  SessionInfo,
  SessionMode,
} from "./types.js";
export type { ModelInfo, CustomApiFormat, ProviderInfo, CustomProviderDef, ThinkingLevel } from "./config-types.js";
export { DEFAULT_THINKING_LEVEL } from "./config-types.js";

// Agent — orchestrator
export {
  getSkills,
  resolveModel,
} from "./agent/orchestrator.js";

// Re-export pi-ai/pi-agent-core types needed by consumers
export type { AgentEvent } from "@mariozechner/pi-agent-core";
export type { ToolCall } from "@mariozechner/pi-ai";

// Session — storage
export type { SwitchBranchResult, SessionStorage } from "./session/index.js";
export { createSessionStorage } from "./session/index.js";

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
  type CreatedSession,
  type CompactResult,
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
  validateRendererTheme,
  RendererV1Error,
  RendererBuildError,
  type RendererBundle,
  type RendererTheme,
  type RendererThemeTokens,
  type RendererV1ErrorPhase,
} from "./renderer/index.js";

// Re-export pi-ai model registry functions for consumers (webui config)
export { getProviders, getModels } from "@mariozechner/pi-ai";
