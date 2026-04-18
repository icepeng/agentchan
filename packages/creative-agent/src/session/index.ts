/**
 * Session surface — pure data layer (no pi-ai, no LLM).
 *
 * LLM-touching operations live in ../agent.
 */

export type {
  SessionSnapshot,
  DeleteSubtreeResult,
  SwitchBranchResult,
  SessionStorage,
  LoadedSession,
} from "./storage.js";
export { createSessionStorage } from "./storage.js";
export type { SessionMode } from "./format.js";
