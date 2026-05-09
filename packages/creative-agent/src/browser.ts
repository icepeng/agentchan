/**
 * Browser-safe subpath of `@agentchan/creative-agent`. Owns types and
 * pure functions only — no fs, no `node:*`, no LLM runtime. Host webui
 * client code and (post-iframe) iframe-side adapter both import from
 * here so `applyAgentEvent` and friends never drift.
 *
 * Smoke test (`tests/browser-subpath.test.ts`) gates regressions by
 * Bun-building this entry with `target: "browser"`.
 */

// --- pi message/event types (re-exports) ---
export type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
export type {
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";

// --- Provider/model/config types ---
export type {
  ModelInfo,
  CustomApiFormat,
  ProviderInfo,
  CustomProviderDef,
  ThinkingLevel,
} from "./config-types.js";
export { DEFAULT_THINKING_LEVEL } from "./config-types.js";

// --- Slash command parsing ---
export {
  parseSlashInput,
  serializeCommand,
  type ParsedSlashCommand,
} from "./slash/parse.js";

// --- Slug utility ---
export { slugify } from "./slug.js";

// --- Workspace types + frontmatter helpers ---
export type {
  ProjectFile,
  TextFile,
  DataFile,
  BinaryFile,
} from "./workspace/types.js";
export {
  parseFrontmatter,
  stringifyFrontmatter,
  type ParsedFrontmatter,
} from "./workspace/frontmatter.js";

// --- Skills (types only) ---
export type { SkillMetadata, SkillEnvironment } from "./skills/types.js";

// --- Session — Pi-compatible types + pure helpers ---
export type {
  SessionEntry,
  SessionEntryBase,
  SessionMessageEntry,
  SessionInfoEntry,
  CompactionEntry,
  CustomMessageEntry,
  ModelChangeEntry,
  ThinkingLevelChangeEntry,
  BranchSummaryEntry,
  CustomEntry,
  LabelEntry,
  SessionHeader,
  SessionInfo,
  SessionContext,
  FileEntry,
  AgentchanSessionHeader,
  AgentchanSessionInfo,
  SessionMode,
} from "./session/types.js";
export { CURRENT_SESSION_VERSION } from "./session/types.js";
export {
  branchFromLeaf,
  defaultLeafId,
  siblingsOf,
} from "./session/branch.js";
export { buildSessionContext } from "./session/context.js";
export {
  getLatestCompactionEntry,
  parseSessionEntries,
} from "./session/parse.js";

// --- Agent state — canonical reducer + types (host + iframe both import) ---
export type { AgentState } from "./agent-state.js";
export { EMPTY_AGENT_STATE, applyAgentEvent } from "./agent-state.js";
