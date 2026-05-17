import { useCallback } from "react";
import { mutate as globalMutate, useSWRConfig } from "swr";
import {
  pickDefaultCreativeSessionId,
  useSessionMutations,
  useSessionData,
  useActiveSessionSelection,
  useSessionSelectionDispatch,
  type SessionData,
  type SessionMode,
} from "@/client/session/data/index.js";
import {
  useViewState,
  useViewDispatch,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import { qk } from "@/client/platform/index.js";
import { useAgentStreamDispatch } from "./stream/AgentStreamStoreContext.js";

export function useSession() {
  const view = useViewState();
  const viewDispatch = useViewDispatch();
  const selection = useActiveSessionSelection();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const agentDispatch = useAgentStreamDispatch();
  const slug = selectActiveProjectSlug(view);
  const mutations = useSessionMutations(slug);
  const { mutate } = useSWRConfig();
  const { data: sessionData } = useSessionData(slug, selection.openSessionId);

  const create = useCallback(async (mode?: SessionMode) => {
    if (!slug) return;
    const info = await mutations.create(mode);
    viewDispatch({ type: "OPEN_SESSION", sessionId: info.id });
    return info;
  }, [slug, mutations, viewDispatch]);

  const load = (id: string) => {
    if (!slug) return;
    viewDispatch({ type: "OPEN_SESSION", sessionId: id });
  };

  const remove = async (id: string) => {
    if (!slug) return;
    const sessions = await mutations.remove(id);
    if (selection.openSessionId === id) {
      const next = pickDefaultCreativeSessionId(sessions);
      viewDispatch({ type: "OPEN_SESSION", sessionId: next });
    }
  };

  const refresh = async () => {
    if (!slug) return;
    await mutate(qk.sessions(slug));
  };

  const switchBranch = useCallback(
    (entryId: string) => {
      if (!selection.openSessionId || !slug) return;
      const key = qk.session(slug, selection.openSessionId);
      void globalMutate<SessionData>(
        key,
        (cur) => (cur ? { ...cur, leafId: entryId } : cur),
        { revalidate: false },
      );
    },
    [selection.openSessionId, slug],
  );

  const setReplyTo = useCallback((entryId: string | null) => {
    if (!slug && entryId !== null) return;
    sessionSelectionDispatch({ type: "SET_REPLY_TO", entryId });
  }, [sessionSelectionDispatch, slug]);

  const compact = async () => {
    if (!slug || !selection.openSessionId) return;
    const sessionId = selection.openSessionId;
    agentDispatch({ type: "START", projectSlug: slug });
    try {
      await mutations.compact(sessionId, sessionData?.leafId);
      agentDispatch({ type: "STOP", projectSlug: slug });
    } catch (err) {
      agentDispatch({
        type: "ERROR",
        projectSlug: slug,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    create,
    load,
    remove,
    refresh,
    switchBranch,
    setReplyTo,
    compact,
    activeSessionId: selection.openSessionId,
  };
}
