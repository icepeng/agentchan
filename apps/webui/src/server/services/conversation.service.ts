import { join } from "node:path";
import {
  type AgentContext,
  type SessionMode,
  type TreeNodeWithChildren,
  createConversation,
  deleteConversation,
  compactConversation,
  restoreCheckpoint,
} from "@agentchan/creative-agent";

/**
 * Walk up the tree from nodeId to find the checkpoint key:
 * the first node whose parent is a user node (i.e., the first assistant
 * child of the user node that started the turn).
 */
function findCheckpointKey(
  tree: Map<string, TreeNodeWithChildren>,
  nodeId: string,
): string | null {
  let current = nodeId;
  while (current) {
    const node = tree.get(current);
    if (!node?.parentId) return null;
    const parent = tree.get(node.parentId);
    if (parent && parent.message.role === "user") return current;
    current = node.parentId;
  }
  return null;
}

export function createConversationService(ctx: AgentContext) {
  /**
   * Restore files from a checkpoint, given any node in the turn.
   * Walks up to find the checkpoint key, then restores files.
   */
  async function tryRestoreCheckpoint(slug: string, conversationId: string, nodeId: string): Promise<void> {
    if (!ctx.checkpointStore) return;
    const loaded = await ctx.storage.loadConversationWithTree(slug, conversationId);
    if (!loaded) return;

    const checkpointKey = findCheckpointKey(loaded.tree, nodeId);
    if (checkpointKey) {
      const projectDir = join(ctx.projectsDir, slug);
      await restoreCheckpoint(projectDir, ctx.checkpointStore, checkpointKey);
    }
  }

  return {
    list: (slug: string) => ctx.storage.listConversations(slug),

    get: (slug: string, id: string) => ctx.storage.loadSnapshot(slug, id),

    getConversation: (slug: string, id: string) => ctx.storage.getConversation(slug, id),

    create: (slug: string, mode?: SessionMode) => createConversation(ctx, slug, mode),

    delete: (slug: string, id: string) => deleteConversation(ctx, slug, id),

    deleteSubtree: (slug: string, conversationId: string, nodeId: string) =>
      ctx.storage.deleteSubtree(slug, conversationId, nodeId),

    compact: (slug: string, conversationId: string) =>
      compactConversation(ctx, slug, conversationId),

    switchBranch: (slug: string, conversationId: string, nodeId: string) =>
      ctx.storage.switchBranch(slug, conversationId, nodeId),

    // --- Checkpoint ---

    getCheckpointNodeIds: (conversationId: string): string[] =>
      ctx.checkpointStore?.listForConversation(conversationId) ?? [],

    restoreCheckpointForNode: tryRestoreCheckpoint,

    restoreCheckpointForRegenerate: tryRestoreCheckpoint,
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
