// Checkpoint
export type { FileSnapshot, CheckpointStore } from "./checkpoint/index.js";
export { createCheckpointStore, restoreCheckpoint } from "./checkpoint/index.js";

// Skills
export { discoverProjectSkills } from "./skills/discovery.js";
export type { SkillMetadata, SkillEnvironment } from "./skills/types.js";

// Slash command parsing
export { parseSlashInput } from "./slash/parse.js";

// Slug utility
export { slugify } from "./slug.js";

// Types
export type { AgentMessage, TokenUsage, TreeNode, TreeNodeWithChildren, Conversation } from "./types.js";
export type { ModelInfo, CustomApiFormat, ProviderInfo, CustomProviderDef, ThinkingLevel } from "./config-types.js";

// Agent — orchestrator
export {
  getSkills,
  resolveModel,
} from "./agent/orchestrator.js";

// Re-export pi-ai/pi-agent-core types needed by consumers
export type { AgentEvent } from "@mariozechner/pi-agent-core";
export type { ToolCall } from "@mariozechner/pi-ai";

// Conversation — storage
export type {
  ConversationSnapshot,
  DeleteSubtreeResult,
  SwitchBranchResult,
  ConversationStorage,
  SessionMode,
} from "./conversation/index.js";
export { createConversationStorage } from "./conversation/index.js";

// Agent — context, config, and LLM-touching ops
export {
  createAgentContext,
  createConversation,
  deleteConversation,
  compactConversation,
  runPrompt,
  runRegenerate,
  type AgentContext,
  type ResolvedAgentConfig,
  type CreatedConversation,
  type CompactResult,
  type SessionEvent,
} from "./agent/index.js";

// Workspace
export type { ProjectFile } from "./workspace/types.js";
export { scanWorkspaceFiles } from "./workspace/scan.js";

// Re-export pi-ai model registry functions for consumers (webui config)
export { getProviders, getModels } from "@mariozechner/pi-ai";
