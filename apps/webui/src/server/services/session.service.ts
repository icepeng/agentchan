import {
  type AgentContext,
  type SessionMode,
  createSession,
  deleteSession,
  compactSession,
  deriveSessionCreatedAt,
  deriveSessionProviderModel,
  deriveSessionTitle,
  deriveSessionUpdatedAt,
} from "@agentchan/creative-agent";

function sessionListItem(
  id: string,
  header: Parameters<typeof deriveSessionCreatedAt>[0],
  entries: Parameters<typeof deriveSessionTitle>[0],
) {
  const { provider, model } = deriveSessionProviderModel(entries);
  return {
    id,
    title: deriveSessionTitle(entries),
    createdAt: deriveSessionCreatedAt(header, entries),
    updatedAt: deriveSessionUpdatedAt(header, entries),
    provider,
    model,
    ...(header?.parentSession ? { compactedFrom: header.parentSession } : {}),
    ...(header?.mode ? { mode: header.mode } : {}),
  };
}

export function createSessionService(ctx: AgentContext) {
  return {
    list: async (slug: string) => {
      const sessions = await ctx.storage.listSessions(slug);
      return sessions.map((session) =>
        sessionListItem(session.id, session.header, session.entries),
      );
    },

    get: async (slug: string, id: string, leafId?: string | null) => {
      const detail = await ctx.storage.loadSession(slug, id, leafId);
      if (!detail) return null;
      return {
        entries: detail.entries,
        leafId: detail.leafId,
      };
    },

    create: async (slug: string, mode?: SessionMode) => {
      const created = await createSession(ctx, slug, mode);
      return {
        session: sessionListItem(created.id, created.header, created.entries),
      };
    },

    delete: (slug: string, id: string) => deleteSession(ctx, slug, id),

    rename: async (slug: string, sessionId: string, leafId: string | null, name: string) => {
      const entry = await ctx.storage.appendSessionInfo(slug, sessionId, leafId, name);
      if (!entry) return null;
      const detail = await ctx.storage.loadSession(slug, sessionId, entry.id);
      if (!detail) return null;
      return {
        entries: detail.entries,
        leafId: detail.leafId,
      };
    },

    compact: (slug: string, sessionId: string, leafId?: string | null) =>
      compactSession(ctx, slug, sessionId, leafId),
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
