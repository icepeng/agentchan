/**
 * Conversation surface — pure data layer (no pi-ai, no LLM).
 *
 * LLM-touching operations live in ../agent.
 */

export type {
  ConversationSnapshot,
  DeleteSubtreeResult,
  SwitchBranchResult,
  ConversationStorage,
  LoadedConversation,
} from "./storage.js";
export { createConversationStorage } from "./storage.js";
