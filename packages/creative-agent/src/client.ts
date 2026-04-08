/**
 * Client-safe entry point for @agentchan/creative-agent.
 *
 * This file MUST NOT (transitively) import any module that uses `node:fs`,
 * `node:path`, `process.execPath`, `Bun.spawn`, or any other server-only API.
 * Browser hosts (and any future RPC/IDE-plugin client) import from
 * `@agentchan/creative-agent/client`; the root entry (`./index.ts`) remains
 * the full server-side surface.
 *
 * What lives here vs. there:
 *   - Slash domain (parsing, lookup, catalog)              → here
 *   - Skill detect predicate (isSkillContentBlock)         → here
 *   - Conversation tree algorithms (pure data ops)         → here
 *   - Domain types (SkillRecord, TreeNode, ContentBlock…)  → here
 *   - Skill discovery (fs walk)                            → server entry only
 *   - SkillManager / activate_skill tool                   → server entry only
 *   - Tools (read/write/edit/grep/script/...)              → server entry only
 *   - Session storage (JSONL append)                       → server entry only
 *   - buildSkillContent (`node:path`)                      → server entry only
 *   - Logger (`process.stderr`)                            → server entry only
 *
 * Adding a new export here? It (and everything it imports) MUST be
 * isomorphic. Run a `from "node:` grep against the transitive graph before
 * widening the surface.
 */

// --- Slash domain (catalog + parsing + lookup) ---
export {
  parseSlashCommand,
  findSlashInvocableSkill,
  listSlashCommands,
  type ParsedSlashCommand,
  type SlashCommandInfo,
  type SlashSource,
} from "./slash/index.js";

// --- Skill detect predicate (pure, no node:path) ---
export { isSkillContentBlock } from "./skills/skill-content-detect.js";

// --- Conversation tree algorithms (pure, type-only deps) ---
export {
  computeActivePath,
  flattenPathToMessages,
  pathToNode,
  switchBranch,
} from "./session/tree.js";

// --- Domain types ---
export type { SkillRecord, SkillMetadata } from "./skills/types.js";
export type {
  ContentBlock,
  StoredMessage,
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
  Conversation,
} from "./types.js";

// --- pi-agent-core / pi-ai type re-exports ---
// These are erased at compile time. The underlying packages were verified
// isomorphic (zero `from "node:*"` in dist), so values would also be safe
// to widen later if needed — kept type-only for now since no client value
// consumer exists.
export type { AgentEvent } from "@mariozechner/pi-agent-core";
export type { AssistantMessage, AssistantMessageEvent, Message, ToolCall } from "@mariozechner/pi-ai";
