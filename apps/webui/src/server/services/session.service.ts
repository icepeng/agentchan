import {
  type AgentContext,
  type SessionMode,
  createSession,
  deleteSession,
  compactSession,
} from "@agentchan/creative-agent";

export function createSessionService(ctx: AgentContext) {
  return {
    list: (slug: string) => ctx.storage.listSessions(slug),

    read: (slug: string, id: string, leafId?: string | null) =>
      ctx.storage.readSession(slug, id, leafId),

    create: (slug: string, mode?: SessionMode) => createSession(ctx, slug, mode),

    delete: (slug: string, id: string) => deleteSession(ctx, slug, id),

    rename: async (slug: string, id: string, leafId: string | null, name: string) => {
      const persisted = await ctx.storage.appendAtLeaf(slug, id, leafId, [
        { type: "session_info", name },
      ]);
      return persisted[0];
    },

    compact: (slug: string, sessionId: string, leafId?: string | null) =>
      compactSession(ctx, slug, sessionId, leafId),
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
