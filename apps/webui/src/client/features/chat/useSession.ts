import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useAgentStateDispatch,
} from "@/client/entities/agent-state/index.js";
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
  const agentDispatch = useAgentStateDispatch();
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

  const switchBranch = async (entryId: string) => {
    if (!selection.openSessionId || !slug) return;
    await mutations.switchBranch(selection.openSessionId, entryId);
  };

  const setReplyTo = (entryId: string | null) => {
    if (!slug) return;
    sessionSelectionDispatch({ type: "SET_REPLY_TO", projectSlug: slug, entryId });
  };

  const compact = async () => {
    if (!slug || !selection.openSessionId) return;
    const sessionId = selection.openSessionId;
    agentDispatch({ type: "BEGIN_BUSY", projectSlug: slug });
    try {
      const result = await mutations.compact(sessionId);
      sessionSelectionDispatch({
        type: "SET_ACTIVE_SESSION",
        projectSlug: slug,
        sessionId: result.state.info.id,
      });
      agentDispatch({ type: "END_BUSY", projectSlug: slug });
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
