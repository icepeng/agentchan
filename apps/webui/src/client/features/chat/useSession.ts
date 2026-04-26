import { useCallback } from "react";
import { useSWRConfig } from "swr";
import type { SessionMode } from "@agentchan/creative-agent";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useAgentStateDispatch,
} from "@/client/entities/agent-state/index.js";
import {
  useSessionMutations,
  useActiveSessionSelection,
  useSessionSelectionDispatch,
  useSessionData,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";

export function useSession() {
  const projectSelection = useProjectSelectionState();
  const selection = useActiveSessionSelection();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const agentDispatch = useAgentStateDispatch();
  const slug = projectSelection.activeProjectSlug;
  const mutations = useSessionMutations(slug);
  const { data: activeSessionData } = useSessionData(slug, selection.openSessionId);
  const { mutate } = useSWRConfig();

  const create = useCallback(async (mode?: SessionMode) => {
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

  const rename = async (id: string, name: string) => {
    if (!slug) return;
    const leafId = id === selection.openSessionId ? activeSessionData?.leafId ?? null : null;
    await mutations.rename(id, leafId, name);
  };

  const refresh = async () => {
    if (!slug) return;
    await mutate(qk.sessions(slug));
  };

  const selectLeaf = async (leafId: string) => {
    if (!selection.openSessionId || !slug) return;
    await mutations.selectLeaf(selection.openSessionId, leafId);
  };

  const setAppendLeaf = (leafId: string | null) => {
    if (!slug) return;
    sessionSelectionDispatch({ type: "SET_APPEND_LEAF", projectSlug: slug, leafId });
  };

  const compact = async () => {
    if (!slug || !selection.openSessionId) return;
    const sessionId = selection.openSessionId;
    agentDispatch({ type: "START", projectSlug: slug });
    try {
      await mutations.compact(sessionId, activeSessionData?.leafId);
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
    rename,
    refresh,
    selectLeaf,
    setAppendLeaf,
    compact,
    activeSessionId: selection.openSessionId,
  };
}
