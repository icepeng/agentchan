import useSWR, { useSWRConfig } from "swr";
import type { SessionMode } from "@agentchan/creative-agent";
import { qk } from "@/client/shared/queryKeys.js";
import {
  createSession as apiCreate,
  deleteSession as apiDelete,
  renameSession as apiRename,
  compactSession as apiCompact,
  fetchSessions,
  fetchSession,
} from "./session.api.js";

export function useSessions(projectSlug: string | null) {
  return useSWR<Awaited<ReturnType<typeof fetchSessions>>>(
    projectSlug ? qk.sessions(projectSlug) : null,
  );
}

export function useSessionData(projectSlug: string | null, sessionId: string | null) {
  return useSWR<Awaited<ReturnType<typeof fetchSession>>>(
    projectSlug && sessionId ? qk.session(projectSlug, sessionId) : null,
  );
}

/**
 * Session mutations scoped to one project. Each mutation invalidates
 * both the list (`sessions`) and the detail (`session`) when both shapes change.
 */
export function useSessionMutations(projectSlug: string | null) {
  const { mutate } = useSWRConfig();

  const create = async (mode?: SessionMode) => {
    if (!projectSlug) throw new Error("create: projectSlug required");
    const result = await apiCreate(projectSlug, mode);
    await mutate(qk.sessions(projectSlug));
    await mutate(
      qk.session(projectSlug, result.session.id),
      {
        entries: [],
        leafId: null,
      } satisfies Awaited<ReturnType<typeof fetchSession>>,
      { revalidate: false },
    );
    return result;
  };

  const remove = async (id: string) => {
    if (!projectSlug) throw new Error("remove: projectSlug required");
    await apiDelete(projectSlug, id);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, id), undefined, { revalidate: false });
  };

  const rename = async (id: string, name: string) => {
    if (!projectSlug) throw new Error("rename: projectSlug required");
    const result = await apiRename(projectSlug, id, name);
    await mutate(qk.sessions(projectSlug));
    await mutate(
      qk.session(projectSlug, id),
      {
        entries: result.entries,
        leafId: result.leafId,
      } satisfies Awaited<ReturnType<typeof fetchSession>>,
      { revalidate: false },
    );
    return result;
  };

  const selectLeaf = async (sessionId: string, leafId: string) => {
    if (!projectSlug) throw new Error("selectLeaf: projectSlug required");
    await mutate<Awaited<ReturnType<typeof fetchSession>>>(
      qk.session(projectSlug, sessionId),
      (cur) => cur?.entries.some((entry) => entry.id === leafId)
        ? { ...cur, leafId }
        : cur,
      { revalidate: false },
    );
  };

  const compact = async (sessionId: string, leafId?: string | null) => {
    if (!projectSlug) throw new Error("compact: projectSlug required");
    const result = await apiCompact(projectSlug, sessionId, leafId);
    await mutate(qk.sessions(projectSlug));
    await mutate(
      qk.session(projectSlug, sessionId),
      {
        entries: result.entries,
        leafId: result.leafId,
      } satisfies Awaited<ReturnType<typeof fetchSession>>,
      { revalidate: false },
    );
    return result;
  };

  return { create, remove, rename, selectLeaf, compact };
}
