/**
 * Pure data-layer operations on conversations.
 *
 * Every function here takes a ConversationContext (storage only) — no LLM,
 * no pi-ai. Functions that need an LLM live in ../agent/lifecycle.ts.
 */

import type {
  Conversation,
  TreeNodeWithChildren,
} from "../types.js";
import type { LoadedConversation } from "./storage.js";
import {
  computeActivePath,
  switchBranch as switchBranchInTree,
} from "./tree.js";
import type { ConversationContext } from "./context.js";

// --- Public types ---

export interface ConversationSnapshot {
  conversation: Conversation;
  nodes: TreeNodeWithChildren[];
  activePath: string[];
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
  ctx: ConversationContext,
  slug: string,
): Promise<Conversation[]> {
  return ctx.storage.listConversations(slug);
}

export function getConversation(
  ctx: ConversationContext,
  slug: string,
  id: string,
): Promise<Conversation | null> {
  return ctx.storage.getConversation(slug, id);
}

export async function loadConversationSnapshot(
  ctx: ConversationContext,
  slug: string,
  id: string,
): Promise<ConversationSnapshot | null> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, id);
  if (!loaded) return null;
  return snapshotFromLoaded(loaded);
}

// --- Delete subtree ---

export async function deleteSubtree(
  ctx: ConversationContext,
  slug: string,
  conversationId: string,
  nodeId: string,
): Promise<DeleteSubtreeResult> {
  return ctx.storage.deleteSubtree(slug, conversationId, nodeId);
}

// --- Switch branch ---

export async function switchBranch(
  ctx: ConversationContext,
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
