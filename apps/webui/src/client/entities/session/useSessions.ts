import useSWR, { useSWRConfig } from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import {
  createSession as apiCreate,
  deleteSession as apiDelete,
  compactSession as apiCompact,
  renameSession as apiRename,
} from "./session.api.js";
import type {
  AgentchanSessionInfo,
  SessionEntry,
  SessionMode,
} from "./session.types.js";

/** Server-shaped session detail returned by `/sessions/:id`. */
export interface SessionData {
  info: AgentchanSessionInfo;
  entries: SessionEntry[];
  leafId: string | null;
}

export function useSessions(projectSlug: string | null) {
  return useSWR<AgentchanSessionInfo[]>(
    projectSlug ? qk.sessions(projectSlug) : null,
  );
}

export function useSessionData(projectSlug: string | null, sessionId: string | null) {
  return useSWR<SessionData>(
    projectSlug && sessionId ? qk.session(projectSlug, sessionId) : null,
  );
}

/**
 * Session mutations scoped to one project. Each mutation invalidates
 * both the list (`sessions`) and the detail (`session`) when both
 * shapes change.
 */
export function useSessionMutations(projectSlug: string | null) {
  const { mutate } = useSWRConfig();

  const create = async (mode?: SessionMode) => {
    if (!projectSlug) throw new Error("create: projectSlug required");
    const info = await apiCreate(projectSlug, mode);
    await mutate(qk.sessions(projectSlug));
    await mutate(
      qk.session(projectSlug, info.id),
      { info, entries: [], leafId: null } satisfies SessionData,
      { revalidate: false },
    );
    return info;
  };

  const remove = async (id: string) => {
    if (!projectSlug) throw new Error("remove: projectSlug required");
    await apiDelete(projectSlug, id);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, id), undefined, { revalidate: false });
  };

  const rename = async (sessionId: string, leafId: string | null, name: string) => {
    if (!projectSlug) throw new Error("rename: projectSlug required");
    const { entry } = await apiRename(projectSlug, sessionId, leafId, name);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, sessionId));
    return entry;
  };

  const compact = async (sessionId: string, leafId?: string | null) => {
    if (!projectSlug) throw new Error("compact: projectSlug required");
    const result = await apiCompact(projectSlug, sessionId, leafId);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, sessionId));
    return result;
  };

  return { create, remove, rename, compact };
}
