/**
 * Conversation operations that touch the LLM or seed agent state.
 *
 * - createConversation: storage create + always-active skill seed node
 * - deleteConversation: storage delete + per-conversation agent state cleanup
 * - compactConversation: LLM-based summarization, persisted as a fresh conversation
 */

import { join } from "node:path";
import { nanoid } from "nanoid";

import type { Conversation, TreeNode } from "../types.js";
import { flattenPathToMessages } from "../conversation/tree.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { fullCompact } from "./compact.js";
import { storedToPiMessages } from "./convert.js";
import { resolveModel, clearConversationAgentState } from "./orchestrator.js";
import { type AgentContext, projectDirOf } from "./context.js";
import { buildAlwaysActiveSeedNode } from "./build.js";

// --- Public types ---

export interface CreatedConversation {
  conversation: Conversation;
  /** Seed nodes (always-active skills) inserted at creation time. */
  nodes: TreeNode[];
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
  const projectDir = projectDirOf(ctx, slug);
  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  const autoNode = buildAlwaysActiveSeedNode(projectDir, skills, null);
  if (autoNode) {
    await ctx.storage.appendNode(slug, conv.id, autoNode);
    return {
      conversation: { ...conv, rootNodeId: autoNode.id, activeLeafId: autoNode.id },
      nodes: [autoNode],
    };
  }
  return { conversation: conv, nodes: [] };
}

export async function deleteConversation(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  // Releases the per-conversation Google explicit cache entry — leaks if
  // skipped on Gemini cache-enabled runs.
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
  await ctx.storage.appendNode(slug, newConv.id, userNode);
  await ctx.storage.appendNode(slug, newConv.id, assistantNode);

  // Seed always-active skills as a child of the ack assistant node so the
  // order is `summary → ack → seed → first real prompt` — freshest context
  // last for LLM attention.
  const projectDir = projectDirOf(ctx, slug);
  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  const autoNode = buildAlwaysActiveSeedNode(projectDir, skills, assistantNode.id);
  if (autoNode) {
    await ctx.storage.appendNode(slug, newConv.id, autoNode);
  }

  const nodes: TreeNode[] = autoNode
    ? [userNode, assistantNode, autoNode]
    : [userNode, assistantNode];
  const activeLeafId = (autoNode ?? assistantNode).id;

  return {
    conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId },
    nodes,
    sourceConversationId: sourceId,
  };
}
