/**
 * Session surface — pure data layer (no pi-ai, no LLM).
 *
 * LLM-touching operations live in ../agent.
 */

export type {
  SwitchBranchResult,
  SessionStorage,
} from "./storage.js";
export { createSessionStorage } from "./storage.js";
export type {
  ProjectSessionInfo,
  ProjectSessionState,
  SessionMode,
} from "../types.js";
