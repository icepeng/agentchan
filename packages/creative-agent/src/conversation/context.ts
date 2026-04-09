/**
 * ConversationContext — minimal handle for pure data-layer functions.
 * Holds only the storage adapter; agent runtime config lives in AgentContext.
 */

import type { ConversationStorage } from "./storage.js";

export interface ConversationContext {
  storage: ConversationStorage;
}
