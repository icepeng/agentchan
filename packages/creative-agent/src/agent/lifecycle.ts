/**
 * Conversation operations that touch the LLM or seed agent state.
 *
 * - createConversation: storage create (no bootstrap nodes)
 * - deleteConversation: storage delete + per-conversation agent state cleanup
 * - compactConversation: LLM-based summarization, persisted as a fresh conversation
 */

import { nanoid } from "nanoid";

import type { Conversation, TreeNode } from "../types.js";
import { flattenPathToMessages } from "../conversation/tree.js";
import { fullCompact } from "./compact.js";
import { storedToPiMessages } from "./convert.js";
import { resolveModel, clearConversationAgentState } from "./orchestrator.js";
import { type AgentContext } from "./context.js";

// --- Public types ---

export interface CreatedConversation {
  conversation: Conversation;
}

export interface CompactResult {
  conversation: Conversation;
  nodes: TreeNode[];
  sourceConversationId: string;
}

// --- Create / delete ---

export async function createConversation(
  ctx: AgentContext,
  slug: string,
): Promise<CreatedConversation> {
  const cfg = ctx.resolveAgentConfig();
  const conv = await ctx.storage.createConversation(slug, cfg.provider, cfg.model);
  return { conversation: conv };
}

export async function deleteConversation(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  clearConversationAgentState(id);
  await ctx.storage.deleteConversation(slug, id);
}

// --- Compact ---

export async function compactConversation(
  ctx: AgentContext,
  slug: string,
  sourceId: string,
): Promise<CompactResult> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, sourceId);
  if (!loaded) throw new Error("Conversation not found");
  if (loaded.activePath.length === 0) {
    throw new Error("Conversation is empty");
  }

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  const history = flattenPathToMessages(loaded.tree, loaded.activePath);
  const piMessages = storedToPiMessages(history);
  const result = await fullCompact({
    messages: piMessages,
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
  const newConv = await ctx.storage.createConversation(
    slug,
    cfg.provider,
    cfg.model,
    sourceId,
  );

  const userNode: TreeNode = {
    id: nanoid(12),
    parentId: null,
    role: "user",
    content: [{ type: "text", text: summaryText }],
    createdAt: Date.now(),
    meta: "compact-summary",
  };
  const assistantNode: TreeNode = {
    id: nanoid(12),
    parentId: userNode.id,
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Understood. I have the full context from the previous conversation and I'm ready to continue. What would you like to work on next?",
      },
    ],
    createdAt: Date.now(),
    provider: cfg.provider,
    model: cfg.model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ...(result.cost ? { cost: result.cost } : {}),
    },
    meta: "compact-summary",
  };

  const nodes: TreeNode[] = [userNode, assistantNode];
  await ctx.storage.appendNodes(slug, newConv.id, nodes);

  return {
    conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId: assistantNode.id },
    nodes,
    sourceConversationId: sourceId,
  };
}
