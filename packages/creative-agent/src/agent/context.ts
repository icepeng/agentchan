/**
 * AgentContext extends SessionContext with the runtime config resolver
 * and project root path. Pass it to any agent function (runPrompt,
 * compactSession, createSession, …) — subtype substitution lets it
 * stand in as a SessionContext for read-only data ops too.
 */

import { join } from "node:path";
import { createSessionStorage, type SessionStorage } from "../session/storage.js";
import type { ResolvedAgentConfig } from "./config.js";

export interface AgentContext {
  storage: SessionStorage;
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
    storage: createSessionStorage(opts.projectsDir),
    projectsDir: opts.projectsDir,
    resolveAgentConfig: opts.resolveAgentConfig,
  };
}

export function projectDirOf(ctx: AgentContext, slug: string): string {
  return join(ctx.projectsDir, slug);
}
