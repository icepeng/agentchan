import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useStreamDispatch,
} from "@/client/entities/stream/index.js";
import {
  useSessionMutations,
  useActiveSessionSelection,
  useSessionSelectionDispatch,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";

export function useSession() {
  const projectSelection = useProjectSelectionState();
  const selection = useActiveSessionSelection();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const streamDispatch = useStreamDispatch();
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
    // Flip selection immediately; `useSessionData(slug, id)` auto-fetches
    // under the new key. Mirrors `useProject.selectProject`, which flips
    // `activeProjectSlug` before the sessions-list fetch resolves —
    // subscribers fall back to empty arrays for the single render gap.
    sessionSelectionDispatch({
      type: "SET_ACTIVE_SESSION",
      projectSlug: slug,
      sessionId: id,
    });
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
    // Stream START locks the input while compact runs server-side.
    streamDispatch({ type: "START", projectSlug: slug });
    try {
      const result = await mutations.compact(sessionId);
      sessionSelectionDispatch({
        type: "SET_ACTIVE_SESSION",
        projectSlug: slug,
        sessionId: result.session.id,
      });
      streamDispatch({ type: "RESET", projectSlug: slug });
    } catch (err) {
      streamDispatch({
        type: "ERROR",
        projectSlug: slug,
        error: err instanceof Error ? err.message : String(err),
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
    deleteNode,
    compact,
    activeSessionId: selection.openSessionId,
  };
}
