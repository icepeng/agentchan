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
  type CompactResult,
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
  buildUserDraftEntries,
  joinUserMessageText,
} from "./build.js";
