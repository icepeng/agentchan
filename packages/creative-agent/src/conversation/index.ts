/**
 * Free-function surface for conversation operations. Every entry point
 * takes a CreativeContext as its first argument.
 */

export type {
  CreativeContext,
  CreativeContextOptions,
  ResolvedAgentConfig,
} from "./context.js";
export { createCreativeContext } from "./context.js";

export type {
  CreatedConversation,
  ConversationSnapshot,
  CompactResult,
  DeleteSubtreeResult,
  SwitchBranchResult,
} from "./lifecycle.js";
export {
  listConversations,
  getConversation,
  loadConversationSnapshot,
  createConversation,
  deleteConversation,
  deleteSubtree,
  switchBranch,
  compactConversation,
} from "./lifecycle.js";

export type {
  SessionEvent,
  Emit,
  PromptInput,
  RegenerateInput,
} from "./prompt.js";
export { runPrompt, runRegenerate } from "./prompt.js";

export {
  buildSkillInjectionContent,
  buildUserNodeForPrompt,
  buildAlwaysActiveSeedNode,
  buildSkillLoadNode,
  joinUserNodeText,
} from "./build.js";

export { summarizeTurnUsage } from "./usage.js";
