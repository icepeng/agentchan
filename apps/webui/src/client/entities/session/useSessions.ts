import useSWR, { useSWRConfig } from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import {
  createSession as apiCreate,
  deleteSession as apiDelete,
  switchBranch as apiSwitchBranch,
  compactSession as apiCompact,
} from "./session.api.js";
import type { ProjectSessionInfo, ProjectSessionState } from "./session.types.js";

export function useSessions(projectSlug: string | null) {
  return useSWR<ProjectSessionInfo[]>(projectSlug ? qk.sessions(projectSlug) : null);
}

export function useSessionData(projectSlug: string | null, sessionId: string | null) {
  const result = useSWR<ProjectSessionState>(
    projectSlug && sessionId ? qk.session(projectSlug, sessionId) : null,
    { keepPreviousData: false },
  );
  if (!result.data || (sessionId && result.data.info.id === sessionId)) return result;
  return { ...result, data: undefined };
}

export function useSessionMutations(projectSlug: string | null) {
  const { mutate } = useSWRConfig();

  const create = async (mode?: "creative" | "meta") => {
    if (!projectSlug) throw new Error("create: projectSlug required");
    const result = await apiCreate(projectSlug, mode);
    await mutate(qk.sessions(projectSlug));
    await mutate(
      qk.session(projectSlug, result.session.id),
      {
        info: result.session,
        entries: [],
        branch: [],
        leafId: null,
      } satisfies ProjectSessionState,
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

  const switchBranch = async (sessionId: string, entryId: string) => {
    if (!projectSlug) throw new Error("switchBranch: projectSlug required");
    const res = await apiSwitchBranch(projectSlug, sessionId, entryId);
    await mutate<ProjectSessionState>(
      qk.session(projectSlug, sessionId),
      (cur) => cur && { ...cur, branch: res.branch, leafId: res.leafId },
      { revalidate: false },
    );
    return res;
  };

  const compact = async (sessionId: string) => {
    if (!projectSlug) throw new Error("compact: projectSlug required");
    const result = await apiCompact(projectSlug, sessionId);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, result.state.info.id), result.state, {
      revalidate: false,
    });
    return result;
  };

  return { create, remove, switchBranch, compact };
}
