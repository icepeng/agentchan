// Tools
export { createScriptTool } from "./tools/script.js";
export { createReadTool } from "./tools/read.js";
export { createWriteTool } from "./tools/write.js";
export { createAppendTool } from "./tools/append.js";
export { createEditTool } from "./tools/edit.js";
export { createGrepTool } from "./tools/grep.js";
export { createLsTool } from "./tools/ls.js";
export { createProjectTools } from "./tools/index.js";
export { textResult } from "./tool-result.js";

// Skills
export { discoverProjectSkills } from "./skills/discovery.js";
export {
  generateCatalog,
  SYSTEM_REMINDER_OPEN,
  SYSTEM_REMINDER_CLOSE,
} from "./skills/catalog.js";
export { SkillManager } from "./skills/manager.js";
export { buildSkillContent, SKILL_CONTENT_PREFIX } from "./skills/skill-content.js";
export type { SkillRecord, SkillMetadata } from "./skills/types.js";

// Slash commands
export {
  parseSlashInput,
  serializeCommand,
  type ParsedSlashCommand,
} from "./slash/parse.js";
export { findSlashInvocableSkill } from "./slash/catalog.js";

// Slug utility
export { slugify } from "./slug.js";

// Types
export type { ContentBlock, NodeMeta, StoredMessage, TokenUsage, TreeNode, TreeNodeWithChildren, Conversation } from "./types.js";
export type { ModelInfo, CustomApiFormat, ProviderInfo, CustomProviderDef, ThinkingLevel } from "./config-types.js";

// Agent
export {
  setupCreativeAgent,
  clearConversationAgentState,
  getSkills,
  resolveModel,
  type CreativeAgentOptions,
  type CreativeAgentSetup,
} from "./agent/orchestrator.js";
export { microCompact, KEEP_RECENT, fullCompact, formatCompactSummary, type FullCompactOptions, type FullCompactResult } from "./agent/compact.js";
export { storedToPiMessages, piToStoredMessages, extractUsage } from "./agent/convert.js";

// Re-export pi-ai/pi-agent-core types needed by consumers
export type { AgentEvent } from "@mariozechner/pi-agent-core";
export type { AssistantMessage, AssistantMessageEvent, Message, ToolCall } from "@mariozechner/pi-ai";

// Conversation — pure data layer
export {
  listConversations,
  getConversation,
  loadConversationSnapshot,
  deleteSubtree,
  switchBranch,
  type ConversationContext,
  type ConversationSnapshot,
  type DeleteSubtreeResult,
  type SwitchBranchResult,
} from "./conversation/index.js";

// Agent — context, config, and LLM-touching ops
export {
  createAgentContext,
  projectDirOf,
  createConversation,
  deleteConversation,
  compactConversation,
  runPrompt,
  runRegenerate,
  buildSkillInjectionContent,
  buildUserNodeForPrompt,
  buildSkillLoadNode,
  joinUserNodeText,
  summarizeTurnUsage,
  type AgentContext,
  type AgentContextOptions,
  type ResolvedAgentConfig,
  type CreatedConversation,
  type CompactResult,
  type SessionEvent,
  type Emit,
  type PromptInput,
  type RegenerateInput,
} from "./agent/index.js";


// Workspace
export type { ProjectFile, TextFile, BinaryFile } from "./workspace/types.js";
export { scanWorkspaceFiles } from "./workspace/scan.js";
export { parseFrontmatter, type ParsedFrontmatter } from "./workspace/frontmatter.js";

// Logger
export * as log from "./logger.js";

// Re-export pi-ai model registry functions for consumers (webui config)
export { getProviders, getModels } from "@mariozechner/pi-ai";
