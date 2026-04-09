/**
 * Shared handle for every conversation function — bundles the SessionStorage
 * adapter and the agent config resolver.
 */

import { join } from "node:path";
import { createSessionStorage, type SessionStorage } from "../session/storage.js";

export interface ResolvedAgentConfig {
  provider: string;
  model: string;
  /** Empty string allowed for custom providers (e.g. local Ollama). */
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  baseUrl?: string;
  apiFormat?: string;
}

export interface CreativeContext {
  projectsDir: string;
  storage: SessionStorage;
  resolveAgentConfig: () => ResolvedAgentConfig;
}

export interface CreativeContextOptions {
  projectsDir: string;
  resolveAgentConfig: () => ResolvedAgentConfig;
}

export function createCreativeContext(opts: CreativeContextOptions): CreativeContext {
  return {
    projectsDir: opts.projectsDir,
    storage: createSessionStorage(opts.projectsDir),
    resolveAgentConfig: opts.resolveAgentConfig,
  };
}

export function projectDirOf(ctx: CreativeContext, slug: string): string {
  return join(ctx.projectsDir, slug);
}
