import type { AssistantMessage, Message, UserMessage } from "@mariozechner/pi-ai";

import type {
  ProjectSessionInfo,
  ProjectSessionState,
  SessionMode,
} from "../types.js";
import { fullCompact } from "./compact.js";
import { clearSessionAgentState, resolveModel } from "./orchestrator.js";
import type { AgentContext } from "./context.js";
import { getSessionModeFromEntries } from "../session/metadata.js";

export interface CreatedSession {
  session: ProjectSessionInfo;
}

export interface CompactResult {
  state: ProjectSessionState;
  sourceSessionId: string;
}

export async function createSession(
  ctx: AgentContext,
  slug: string,
  mode?: SessionMode,
): Promise<CreatedSession> {
  const cfg = ctx.resolveAgentConfig();
  const session = await ctx.storage.createSession(slug, cfg.provider, cfg.model, mode);
  return { session };
}

export async function deleteSession(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  clearSessionAgentState(id);
  await ctx.storage.deleteSession(slug, id);
}

export async function compactSession(
  ctx: AgentContext,
  slug: string,
  sourceId: string,
): Promise<CompactResult> {
  const manager = await ctx.storage.openManager(slug, sourceId);
  if (!manager) throw new Error("Session not found");
  const context = manager.buildSessionContext();
  if (context.messages.length === 0) throw new Error("Session is empty");

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  const result = await fullCompact({
    messages: context.messages as Message[],
    model: resolveModel(
      cfg.provider,
      cfg.model,
      cfg.baseUrl && cfg.apiFormat
        ? { baseUrl: cfg.baseUrl, apiFormat: cfg.apiFormat }
        : undefined,
    ),
    apiKey: cfg.apiKey,
  });

  const mode = getSessionModeFromEntries(manager.getEntries());
  const newSession = await ctx.storage.createSession(slug, cfg.provider, cfg.model, mode);
  const compacted = await ctx.storage.openManager(slug, newSession.id);
  if (!compacted) throw new Error("Compacted session not found");
  const now = Date.now();
  compacted.appendMessage({
    role: "user",
    content: `Conversation summary:\n\n${result.summary}`,
    timestamp: now,
  } as UserMessage);
  compacted.appendMessage({
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Understood. I have the context summary and I am ready to continue.",
      },
    ],
    api: "anthropic-messages",
    provider: cfg.provider,
    model: cfg.model,
    usage: {
      input: result.inputTokens,
      output: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      cacheRead: 0,
      cacheWrite: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: result.cost ?? 0,
      },
    },
    stopReason: "stop",
    timestamp: now,
  } as AssistantMessage);
  await ctx.storage.flush(compacted);
  const state = await ctx.storage.loadState(slug, newSession.id);
  if (!state) throw new Error("Compacted session not found");
  return { state, sourceSessionId: sourceId };
}
