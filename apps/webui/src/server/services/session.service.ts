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

    get: (slug: string, id: string) => ctx.storage.loadSnapshot(slug, id),

    getSession: (slug: string, id: string) => ctx.storage.getSession(slug, id),

    create: (slug: string, mode?: SessionMode) => createSession(ctx, slug, mode),

    delete: (slug: string, id: string) => deleteSession(ctx, slug, id),

    deleteSubtree: (slug: string, sessionId: string, nodeId: string) =>
      ctx.storage.deleteSubtree(slug, sessionId, nodeId),

    compact: (slug: string, sessionId: string) =>
      compactSession(ctx, slug, sessionId),

    switchBranch: (slug: string, sessionId: string, nodeId: string) =>
      ctx.storage.switchBranch(slug, sessionId, nodeId),
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
