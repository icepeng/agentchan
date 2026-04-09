import {
  type AgentContext,
  listConversations,
  loadConversationSnapshot,
  getConversation,
  createConversation,
  deleteConversation,
  deleteSubtree,
  compactConversation,
  switchBranch,
} from "@agentchan/creative-agent";

export function createConversationService(ctx: AgentContext) {
  return {
    list: (slug: string) => listConversations(ctx, slug),

    get: (slug: string, id: string) => loadConversationSnapshot(ctx, slug, id),

    getConversation: (slug: string, id: string) => getConversation(ctx, slug, id),

    create: (slug: string) => createConversation(ctx, slug),

    delete: (slug: string, id: string) => deleteConversation(ctx, slug, id),

    deleteSubtree: (slug: string, conversationId: string, nodeId: string) =>
      deleteSubtree(ctx, slug, conversationId, nodeId),

    compact: (slug: string, conversationId: string) =>
      compactConversation(ctx, slug, conversationId),

    switchBranch: (slug: string, conversationId: string, nodeId: string) =>
      switchBranch(ctx, slug, conversationId, nodeId),
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
