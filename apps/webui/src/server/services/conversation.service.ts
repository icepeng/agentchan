import { join } from "node:path";
import {
  type AgentContext,
  type SessionMode,
  createConversation,
  deleteConversation,
  compactConversation,
  discoverProjectSkills,
  parseSlashInput,
} from "@agentchan/creative-agent";

export function createConversationService(ctx: AgentContext, projectsDir: string) {
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

    /**
     * Check if a slash command targets a meta-environment skill.
     * Returns true when the message should be redirected to a new meta session.
     */
    async checkMetaRedirect(slug: string, text: string): Promise<boolean> {
      const parsed = parseSlashInput(text);
      if (!parsed) return false;
      const skills = await discoverProjectSkills(join(projectsDir, slug, "skills"));
      const skill = skills.get(parsed.name);
      return skill?.meta.environment === "meta";
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
