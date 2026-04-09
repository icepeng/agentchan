/**
 * Conversation surface — pure data layer (no pi-ai, no LLM).
 *
 * Every export here takes a ConversationContext (storage only). LLM-touching
 * operations live in ../agent.
 */

export type { ConversationContext } from "./context.js";

export type {
  ConversationSnapshot,
  DeleteSubtreeResult,
  SwitchBranchResult,
} from "./operations.js";
export {
  listConversations,
  getConversation,
  loadConversationSnapshot,
  deleteSubtree,
  switchBranch,
} from "./operations.js";
