import { useCallback } from "react";
import { mutate as globalMutate } from "swr";
import {
  useProjectSelectionState,
} from "@/client/entities/project/index.js";
import {
  useAgentState,
  hydrateState,
} from "@/client/entities/agent-state/index.js";
import {
  useSessionSelectionState,
  selectSessionSelection,
  useSessionData,
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";

/**
 * Thin wrapper around `sendMessage` / `regenerateResponse`. The server now
 * owns AgentState (state.service) and broadcasts patches through the
 * per-project SSE channel opened by `AgentStateProvider`. This hook only
 * handles three concerns:
 *
 *   1. Parent node resolution (replyTo → last activePath → null)
 *   2. Abort controller lifecycle
 *   3. SWR revalidation of the session tree after streaming completes
 *      (so SessionTabs / tree views show new nodes without a manual refetch)
 */
export function useStreaming() {
  const projectSelection = useProjectSelectionState();
  const sessionSelectionState = useSessionSelectionState();

  const activeSlug = projectSelection.activeProjectSlug;
  const activeSelection = selectSessionSelection(sessionSelectionState, activeSlug);
  const activeState = useAgentState(activeSlug);
  const { data: activeSessionData } = useSessionData(
    activeSlug,
    activeSelection.openSessionId,
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      if (!activeSlug) return;
      const projectSlug = activeSlug;
      const sid = sessionId ?? activeSelection.openSessionId;
      if (!sid) return;

      if (activeState.isStreaming) return;

      const data = activeSessionData;
      const sameSession = data?.session.id === sid;
      const lastActive = sameSession
        ? data?.activePath[data.activePath.length - 1] ?? null
        : null;
      const parentNodeId = sessionId
        ? null
        : activeSelection.replyToNodeId ?? lastActive ?? null;

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        // Make sure the server's state.service has our latest sessionId before
        // the agent run starts — otherwise message_start events would update
        // the wrong snapshot.
        await hydrateState(projectSlug, sid);
        await sendMessage(projectSlug, sid, parentNodeId, text, controller.signal);
      } finally {
        clearAbortController(projectSlug, controller);
        // Session tree has new nodes — revalidate so SessionTabs reflects
        // the persisted shape.
        void globalMutate(qk.session(projectSlug, sid));
        void globalMutate(qk.sessions(projectSlug));
      }
    },
    [
      activeSlug,
      activeSelection.openSessionId,
      activeSelection.replyToNodeId,
      activeSessionData,
      activeState.isStreaming,
    ],
  );

  const regenerate = useCallback(
    async (userNodeId: string) => {
      if (!activeSlug || !activeSelection.openSessionId) return;
      const projectSlug = activeSlug;
      const sid = activeSelection.openSessionId;
      if (activeState.isStreaming) return;

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await hydrateState(projectSlug, sid);
        await regenerateResponse(projectSlug, sid, userNodeId, controller.signal);
      } finally {
        clearAbortController(projectSlug, controller);
        void globalMutate(qk.session(projectSlug, sid));
      }
    },
    [
      activeSlug,
      activeSelection.openSessionId,
      activeState.isStreaming,
    ],
  );

  return { send, regenerate, isStreaming: activeState.isStreaming };
}
