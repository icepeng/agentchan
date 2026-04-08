// Tools
export { createScriptTool } from "./tools/script.js";
export { createReadTool } from "./tools/read.js";
export { createWriteTool } from "./tools/write.js";
export { createAppendTool } from "./tools/append.js";
export { createEditTool } from "./tools/edit.js";
export { createGrepTool } from "./tools/grep.js";
export { createLsTool } from "./tools/ls.js";
export { createProjectTools } from "./tools/index.js";

// Skills
export { discoverSkills, discoverProjectSkills } from "./skills/discovery.js";
export { generateCatalog } from "./skills/catalog.js";
export { SkillManager } from "./skills/manager.js";
export type { SkillRecord, SkillMetadata } from "./skills/types.js";
export {
  parseSlashCommand,
  findSlashInvocableSkill,
  buildSlashSkillContent,
  type ParsedSlashCommand,
} from "./skills/slash.js";

// Session
export {
  computeActivePath,
  flattenPathToMessages,
  pathToNode,
  switchBranch,
  generateTitle,
} from "./session/tree.js";
export {
  createSessionStorage,
  slugify,
  type SessionStorage,
  type LoadedConversation,
} from "./session/storage.js";

// Types
export type { ContentBlock, StoredMessage, TokenUsage, TreeNode, TreeNodeWithChildren, Conversation } from "./types.js";

// Agent
export {
  setupCreativeAgent,
  clearSkillManager,
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

// Logger
export * as log from "./logger.js";

// Re-export pi-ai model registry functions for consumers (webui config)
export { getProviders, getModels } from "@mariozechner/pi-ai";
