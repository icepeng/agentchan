/**
 * Agent surface — context, config, and LLM-touching operations.
 */

export {
  createAgentContext,
  projectDirOf,
  type AgentContext,
  type AgentContextOptions,
} from "./context.js";

export type { ResolvedAgentConfig } from "./config.js";

export {
  createSession,
  deleteSession,
  compactSession,
} from "./lifecycle.js";

export {
  runPrompt,
  runRegenerate,
  type SessionEvent,
  type Emit,
  type PromptInput,
  type RegenerateInput,
} from "./prompt.js";

export {
  buildSkillInjectionContent,
  buildUserEntriesForPrompt,
  joinUserEntryText,
} from "./build.js";
