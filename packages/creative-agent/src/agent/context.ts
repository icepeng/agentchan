/**
 * AgentContext extends ConversationContext with the runtime config resolver
 * and project root path. Pass it to any agent function (runPrompt,
 * compactConversation, createConversation, …) — subtype substitution lets it
 * stand in as a ConversationContext for read-only data ops too.
 */

import { join } from "node:path";
import { createConversationStorage, type ConversationStorage } from "../conversation/storage.js";
import type { ResolvedAgentConfig } from "./config.js";

export interface AgentContext {
  storage: ConversationStorage;
  /** Absolute path to the projects root — agent functions resolve per-project skill paths from here. */
  projectsDir: string;
  resolveAgentConfig: () => ResolvedAgentConfig;
  /** Absolute path to @agentchan/renderer-runtime's source entry. */
  rendererRuntimeEntry: string;
}

export interface AgentContextOptions {
  projectsDir: string;
  resolveAgentConfig: () => ResolvedAgentConfig;
  rendererRuntimeEntry: string;
}

export function createAgentContext(opts: AgentContextOptions): AgentContext {
  return {
    storage: createConversationStorage(opts.projectsDir),
    projectsDir: opts.projectsDir,
    resolveAgentConfig: opts.resolveAgentConfig,
    rendererRuntimeEntry: opts.rendererRuntimeEntry,
  };
}

export function projectDirOf(ctx: AgentContext, slug: string): string {
  return join(ctx.projectsDir, slug);
}
