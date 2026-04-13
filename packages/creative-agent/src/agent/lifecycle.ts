/**
 * Conversation operations that touch the LLM or seed agent state.
 *
 * - createConversation: storage create (no bootstrap nodes)
 * - deleteConversation: storage delete + per-conversation agent state cleanup
 * - compactConversation: LLM-based summarization, persisted as a fresh conversation
 */

import { nanoid } from "nanoid";
import type { Message, UserMessage, AssistantMessage } from "@mariozechner/pi-ai";

import type { Conversation, TreeNode } from "../types.js";
import type { SessionMode } from "../conversation/format.js";
import { flattenPathToMessages } from "../conversation/tree.js";
import { fullCompact } from "./compact.js";
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
  mode?: SessionMode,
): Promise<CreatedConversation> {
  const cfg = ctx.resolveAgentConfig();
  const conv = await ctx.storage.createConversation(slug, cfg.provider, cfg.model, undefined, mode);
  return { conversation: conv };
}

export async function deleteConversation(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  clearConversationAgentState(id);
  ctx.checkpointStore?.clearConversation(id);
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
  const newConv = await ctx.storage.createConversation(
    slug,
    cfg.provider,
    cfg.model,
    sourceId,
    loaded.conversation.mode,
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
  await ctx.storage.appendNodes(slug, newConv.id, nodes);

  return {
    conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId: assistantNode.id },
    nodes,
    sourceConversationId: sourceId,
  };
}
