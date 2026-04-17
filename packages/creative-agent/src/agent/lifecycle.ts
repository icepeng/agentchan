/**
 * Session operations that touch the LLM or seed agent state.
 *
 * - createSession: storage create (no bootstrap nodes)
 * - deleteSession: storage delete + per-session agent state cleanup
 * - compactSession: LLM-based summarization, persisted as a fresh session
 */

import { nanoid } from "nanoid";
import type { Message, UserMessage, AssistantMessage } from "@mariozechner/pi-ai";

import type { Session, TreeNode } from "../types.js";
import type { SessionMode } from "../session/format.js";
import { flattenPathToMessages } from "../session/tree.js";
import { fullCompact } from "./compact.js";
import { resolveModel, clearSessionAgentState } from "./orchestrator.js";
import { type AgentContext } from "./context.js";

// --- Public types ---

export interface CreatedSession {
  session: Session;
}

export interface CompactResult {
  session: Session;
  nodes: TreeNode[];
  sourceSessionId: string;
}

// --- Create / delete ---

export async function createSession(
  ctx: AgentContext,
  slug: string,
  mode?: SessionMode,
): Promise<CreatedSession> {
  const cfg = ctx.resolveAgentConfig();
  const session = await ctx.storage.createSession(slug, cfg.provider, cfg.model, undefined, mode);
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

// --- Compact ---

export async function compactSession(
  ctx: AgentContext,
  slug: string,
  sourceId: string,
): Promise<CompactResult> {
  const loaded = await ctx.storage.loadSessionWithTree(slug, sourceId);
  if (!loaded) throw new Error("Session not found");
  if (loaded.activePath.length === 0) {
    throw new Error("Session is empty");
  }

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  // History is already AgentMessage[] — pass to fullCompact as Message[]
  const history = flattenPathToMessages(loaded.tree, loaded.activePath);
  const result = await fullCompact({
    messages: history as Message[],
    model: resolveModel(
      cfg.provider,
      cfg.model,
      cfg.baseUrl && cfg.apiFormat
        ? { baseUrl: cfg.baseUrl, apiFormat: cfg.apiFormat }
        : undefined,
    ),
    apiKey: cfg.apiKey,
  });

  const summaryText = `This session continues from a previous conversation. Below is the context summary.\n\n${result.summary}`;
  const now = Date.now();
  const newSession = await ctx.storage.createSession(
    slug,
    cfg.provider,
    cfg.model,
    sourceId,
    loaded.session.mode,
  );

  const userNode: TreeNode = {
    id: nanoid(12),
    parentId: null,
    message: {
      role: "user",
      content: summaryText,
      timestamp: now,
    } as UserMessage,
    createdAt: now,
    meta: "compact-summary",
  };
  // Synthetic assistant message for the compact bootstrap. Usage is zero here
  // because the real compact cost lives on the TreeNode-level `usage` field.
  const assistantNode: TreeNode = {
    id: nanoid(12),
    parentId: userNode.id,
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Understood. I have the full context from the previous conversation and I'm ready to continue. What would you like to work on next?",
        },
      ],
      api: "anthropic-messages",
      provider: cfg.provider,
      model: cfg.model,
      usage: { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: now,
    } as AssistantMessage,
    createdAt: now,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ...(result.cost ? { cost: result.cost } : {}),
    },
    meta: "compact-summary",
  };

  const nodes: TreeNode[] = [userNode, assistantNode];
  await ctx.storage.appendNodes(slug, newSession.id, nodes);

  return {
    session: { ...newSession, rootNodeId: userNode.id, activeLeafId: assistantNode.id },
    nodes,
    sourceSessionId: sourceId,
  };
}
