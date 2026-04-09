/**
 * AgentContext extends ConversationContext with the runtime config resolver
 * and project root path. Pass it to any agent function (runPrompt,
 * compactConversation, createConversation, …) — subtype substitution lets it
 * stand in as a ConversationContext for read-only data ops too.
 */

import { join } from "node:path";
import type { ConversationContext } from "../conversation/context.js";
import { createConversationStorage } from "../conversation/storage.js";
import type { ResolvedAgentConfig } from "./config.js";

export interface AgentContext extends ConversationContext {
  /** Absolute path to the projects root — agent functions resolve per-project skill paths from here. */
  projectsDir: string;
  resolveAgentConfig: () => ResolvedAgentConfig;
}

export interface AgentContextOptions {
  projectsDir: string;
  resolveAgentConfig: () => ResolvedAgentConfig;
}

export function createAgentContext(opts: AgentContextOptions): AgentContext {
  return {
    storage: createConversationStorage(opts.projectsDir),
    projectsDir: opts.projectsDir,
    resolveAgentConfig: opts.resolveAgentConfig,
  };
}

export function projectDirOf(ctx: AgentContext, slug: string): string {
  return join(ctx.projectsDir, slug);
}
