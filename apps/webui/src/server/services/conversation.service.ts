import {
  type AgentContext,
  createConversation,
  deleteConversation,
  compactConversation,
} from "@agentchan/creative-agent";

export function createConversationService(ctx: AgentContext) {
  return {
    list: (slug: string) => ctx.storage.listConversations(slug),

    get: (slug: string, id: string) => ctx.storage.loadSnapshot(slug, id),

    getConversation: (slug: string, id: string) => ctx.storage.getConversation(slug, id),

    create: (slug: string) => createConversation(ctx, slug),

    delete: (slug: string, id: string) => deleteConversation(ctx, slug, id),

    deleteSubtree: (slug: string, conversationId: string, nodeId: string) =>
      ctx.storage.deleteSubtree(slug, conversationId, nodeId),

    compact: (slug: string, conversationId: string) =>
      compactConversation(ctx, slug, conversationId),

    switchBranch: (slug: string, conversationId: string, nodeId: string) =>
      ctx.storage.switchBranch(slug, conversationId, nodeId),
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
