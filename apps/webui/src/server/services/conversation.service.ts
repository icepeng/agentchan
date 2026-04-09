import type { CreativeWorkspace } from "@agentchan/creative-agent";

export function createConversationService(workspace: CreativeWorkspace) {
  return {
    list: (slug: string) => workspace.listConversations(slug),

    get: (slug: string, id: string) => workspace.loadConversationSnapshot(slug, id),

    getConversation: (slug: string, id: string) => workspace.getConversation(slug, id),

    create: (slug: string) => workspace.createConversation(slug),

    delete: (slug: string, id: string) => workspace.deleteConversation(slug, id),

    deleteSubtree: (slug: string, conversationId: string, nodeId: string) =>
      workspace.deleteSubtree(slug, conversationId, nodeId),

    compact: (slug: string, conversationId: string) =>
      workspace.compactConversation(slug, conversationId),

    async switchBranch(slug: string, conversationId: string, nodeId: string) {
      const session = await workspace.openSession(slug, conversationId);
      return session.switchBranch(nodeId);
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
