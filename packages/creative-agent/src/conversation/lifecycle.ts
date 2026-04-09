/**
 * Conversation lifecycle as free functions over a CreativeContext.
 * compactConversation is the only function here that calls the LLM.
 */

import { join } from "node:path";
import { nanoid } from "nanoid";

import type {
  Conversation,
  TreeNode,
  TreeNodeWithChildren,
} from "../types.js";
import type { LoadedConversation } from "../session/storage.js";
import {
  computeActivePath,
  switchBranch as switchBranchInTree,
} from "../session/tree.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { fullCompact } from "../agent/compact.js";
import { storedToPiMessages } from "../agent/convert.js";
import { flattenPathToMessages } from "../session/tree.js";
import { resolveModel, clearConversationAgentState } from "../agent/orchestrator.js";

import { type CreativeContext, projectDirOf } from "./context.js";
import { buildAlwaysActiveSeedNode } from "./build.js";

// --- Public types ---

export interface CreatedConversation {
  conversation: Conversation;
  /** Seed nodes (always-active skills) inserted at creation time. */
  nodes: TreeNode[];
}

export interface ConversationSnapshot {
  conversation: Conversation;
  nodes: TreeNodeWithChildren[];
  activePath: string[];
}

export interface CompactResult {
  conversation: Conversation;
  nodes: TreeNode[];
  sourceConversationId: string;
}

export interface DeleteSubtreeResult {
  rootNodeId: string;
  activeLeafId: string;
  activePath: string[];
}

export interface SwitchBranchResult {
  activePath: string[];
  activeLeafId: string;
}

// --- Read-only ---

export function listConversations(
  ctx: CreativeContext,
  slug: string,
): Promise<Conversation[]> {
  return ctx.storage.listConversations(slug);
}

export function getConversation(
  ctx: CreativeContext,
  slug: string,
  id: string,
): Promise<Conversation | null> {
  return ctx.storage.getConversation(slug, id);
}

export async function loadConversationSnapshot(
  ctx: CreativeContext,
  slug: string,
  id: string,
): Promise<ConversationSnapshot | null> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, id);
  if (!loaded) return null;
  return snapshotFromLoaded(loaded);
}

// --- Create / delete ---

export async function createConversation(
  ctx: CreativeContext,
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
  ctx: CreativeContext,
  slug: string,
  id: string,
): Promise<void> {
  // Releases the per-conversation Google explicit cache entry — leaks if
  // skipped on Gemini cache-enabled runs.
  clearConversationAgentState(id);
  await ctx.storage.deleteConversation(slug, id);
}

export async function deleteSubtree(
  ctx: CreativeContext,
  slug: string,
  conversationId: string,
  nodeId: string,
): Promise<DeleteSubtreeResult> {
  return ctx.storage.deleteSubtree(slug, conversationId, nodeId);
}

// --- Switch branch ---

export async function switchBranch(
  ctx: CreativeContext,
  slug: string,
  conversationId: string,
  nodeId: string,
): Promise<SwitchBranchResult | null> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, conversationId);
  if (!loaded) return null;
  const tree = loaded.tree;
  if (!tree.has(nodeId)) return null;

  const { updatedNodes, newLeafId } = switchBranchInTree(tree, nodeId);
  if (updatedNodes.length > 0) {
    await ctx.storage.persistActiveChildUpdates(slug, conversationId, tree);
  }

  const rootNode = [...tree.values()].find((n) => !n.parentId);
  const activePath = rootNode ? computeActivePath(tree, rootNode.id) : [];
  return { activePath, activeLeafId: newLeafId };
}

// --- Compact ---

export async function compactConversation(
  ctx: CreativeContext,
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

// --- Helpers ---

function snapshotFromLoaded(loaded: LoadedConversation): ConversationSnapshot {
  return {
    conversation: loaded.conversation,
    nodes: [...loaded.tree.values()].map(({ children, ...node }) => ({
      ...node,
      children,
    })),
    activePath: loaded.activePath,
  };
}
