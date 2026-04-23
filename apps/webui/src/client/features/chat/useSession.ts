import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useSessionMutations,
  useActiveSessionSelection,
  useSessionSelectionDispatch,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { hydrateState } from "@/client/entities/agent-state/stateApi.js";

export function useSession() {
  const projectSelection = useProjectSelectionState();
  const selection = useActiveSessionSelection();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const slug = projectSelection.activeProjectSlug;
  const mutations = useSessionMutations(slug);
  const { mutate } = useSWRConfig();

  const create = useCallback(async (mode?: "creative" | "meta") => {
    if (!slug) return;
    const { session } = await mutations.create(mode);
    sessionSelectionDispatch({
      type: "SET_ACTIVE_SESSION",
      projectSlug: slug,
      sessionId: session.id,
    });
    return session;
  }, [slug, mutations, sessionSelectionDispatch]);

  const load = (id: string) => {
    if (!slug) return;
    sessionSelectionDispatch({
      type: "SET_ACTIVE_SESSION",
      projectSlug: slug,
      sessionId: id,
    });
    // Tell state.service which session is current so it re-broadcasts a
    // fresh snapshot derived from that session's activePath.
    void hydrateState(slug, id);
  };

  const remove = async (id: string) => {
    if (!slug) return;
    await mutations.remove(id);
    if (selection.openSessionId === id) {
      sessionSelectionDispatch({
        type: "SET_ACTIVE_SESSION",
        projectSlug: slug,
        sessionId: null,
      });
      void hydrateState(slug, null);
    }
  };

  const refresh = async () => {
    if (!slug) return;
    await mutate(qk.sessions(slug));
  };

  const switchBranch = async (nodeId: string) => {
    if (!selection.openSessionId || !slug) return;
    await mutations.switchBranch(selection.openSessionId, nodeId);
  };

  const deleteNode = async (nodeId: string) => {
    if (!selection.openSessionId || !slug) return;
    await mutations.removeNode(selection.openSessionId, nodeId);
  };

  const setReplyTo = (nodeId: string | null) => {
    if (!slug) return;
    sessionSelectionDispatch({ type: "SET_REPLY_TO", projectSlug: slug, nodeId });
  };

  const compact = async () => {
    if (!slug || !selection.openSessionId) return;
    const sessionId = selection.openSessionId;
    const result = await mutations.compact(sessionId);
    sessionSelectionDispatch({
      type: "SET_ACTIVE_SESSION",
      projectSlug: slug,
      sessionId: result.session.id,
    });
    // Pull the fresh snapshot over the state SSE channel.
    await hydrateState(slug, result.session.id);
  };

  return {
    create,
    load,
    remove,
    refresh,
    switchBranch,
    setReplyTo,
    deleteNode,
    compact,
    activeSessionId: selection.openSessionId,
  };
}
