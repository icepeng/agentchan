import { useCallback, useEffect, useRef } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useSessionState,
  useSessionDispatch,
  selectStreamSlot,
  sendMessage,
  regenerateResponse,
  fetchConversation,
  registerAbortController,
  clearAbortController,
  type SSECallbacks,
} from "@/client/entities/session/index.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  isBackgroundStream,
  notifyBackgroundCompletion,
} from "@/client/shared/notifications.js";
import { useProject } from "@/client/features/project/useProject.js";

export function useStreaming() {
  const projectState = useProjectState();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();
  const { t } = useI18n();
  // Needed so notification onClick can perform a full project switch
  // (SWITCH_PROJECT + fetchConversations + fetchSkills) — not just flip
  // activeProjectSlug, which would leave SessionState stale.
  const { selectProject } = useProject();

  const projectStateRef = useRef(projectState);
  useEffect(() => { projectStateRef.current = projectState; });
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; });
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const selectProjectRef = useRef(selectProject);
  useEffect(() => { selectProjectRef.current = selectProject; });

  /**
   * Shared streaming callbacks — identical for send and regenerate.
   * `projectSlug` is captured in closure so every dispatch can route to the
   * correct stream slot even after the user has switched projects.
   */
  const makeCallbacks = useCallback(
    (projectSlug: string, conversationId: string): SSECallbacks => ({
      onUserNode: () => {},
      onTextDelta: (text) =>
        sessionDispatch({ type: "STREAM_TEXT_DELTA", projectSlug, text }),
      onToolUseStart: (id, name) =>
        sessionDispatch({ type: "STREAM_TOOL_START", projectSlug, id, name }),
      onToolUseDelta: (id, inputJson) =>
        sessionDispatch({ type: "STREAM_TOOL_DELTA", projectSlug, id, inputJson }),
      onToolUseEnd: (id) =>
        sessionDispatch({ type: "STREAM_TOOL_END", projectSlug, id }),
      onToolExecStart: (id, _name, parallel) =>
        sessionDispatch({ type: "TOOL_EXEC_START", projectSlug, id, parallel }),
      onToolExecEnd: (id) =>
        sessionDispatch({ type: "TOOL_EXEC_END", projectSlug, id }),
      onUsageSummary: (usage) =>
        sessionDispatch({ type: "STREAM_USAGE_SUMMARY", projectSlug, ...usage }),
      onAssistantNodes: (nodes) => {
        sessionDispatch({ type: "STREAM_COMPLETE", projectSlug, nodes });
        sessionDispatch({ type: "STREAM_RESET", projectSlug });
      },
      onDone: () => {
        const p = projectStateRef.current;
        const s = sessionStateRef.current;
        const projectName =
          p.projects.find((pr) => pr.slug === projectSlug)?.name ?? projectSlug;

        // Fire notification if user isn't actively viewing this project+conversation.
        if (isBackgroundStream(projectSlug, conversationId, p.activeProjectSlug, s.activeConversationId)) {
          notifyBackgroundCompletion({
            projectSlug,
            projectName,
            conversationId,
            kind: "done",
            title: tRef.current("notifications.sessionComplete", { project: projectName }),
            body: tRef.current("notifications.sessionCompleteBody"),
            onClick: () => {
              // Navigate back to the project that just finished. Use the full
              // selectProject orchestration — otherwise SessionState would
              // still hold the previous project's conversations, causing
              // "Conversation not found" 404s when the user clicks a session.
              if (projectStateRef.current.activeProjectSlug !== projectSlug) {
                void selectProjectRef.current(projectSlug);
              }
            },
          });
        }

        // Only reload conversation into state if this stream's project is
        // still the active one — otherwise SET_ACTIVE_CONVERSATION would
        // stomp the view of whichever project the user navigated to.
        // The server has persisted everything; when the user returns, the
        // next selectProject / load call will pick up the fresh tree.
        if (p.activeProjectSlug !== projectSlug) return;
        void fetchConversation(projectSlug, conversationId)
          .then((data) => {
            // Double-check: user may have switched again during the fetch.
            if (projectStateRef.current.activeProjectSlug !== projectSlug) return;
            sessionDispatch({
              type: "SET_ACTIVE_CONVERSATION",
              conversation: data.conversation,
              nodes: data.nodes,
              activePath: data.activePath,
            });
          })
          .catch(() => { /* keep current state */ });
      },
      onError: (message) => {
        console.error("Stream error:", message);
        sessionDispatch({ type: "STREAM_ERROR", projectSlug, error: message });

        const p = projectStateRef.current;
        const s = sessionStateRef.current;
        const projectName =
          p.projects.find((pr) => pr.slug === projectSlug)?.name ?? projectSlug;

        if (isBackgroundStream(projectSlug, conversationId, p.activeProjectSlug, s.activeConversationId)) {
          notifyBackgroundCompletion({
            projectSlug,
            projectName,
            conversationId,
            kind: "error",
            errorMessage: message,
            title: tRef.current("notifications.sessionError", { project: projectName }),
            body: tRef.current("notifications.sessionErrorBody"),
            onClick: () => {
              if (projectStateRef.current.activeProjectSlug !== projectSlug) {
                void selectProjectRef.current(projectSlug);
              }
            },
          });
        }
      },
    }),
    [sessionDispatch],
  );

  /**
   * Send a message. When `conversationId` is provided (e.g. first message to
   * a just-created conversation), it bypasses the ref so it works before React
   * re-renders.
   */
  const send = useCallback(
    async (text: string, conversationId?: string) => {
      const p = projectStateRef.current;
      const s = sessionStateRef.current;
      const convId = conversationId ?? s.activeConversationId;
      if (!convId || !p.activeProjectSlug) return;

      const projectSlug = p.activeProjectSlug;
      const slot = selectStreamSlot(s, projectSlug);
      // Per-project concurrency guard: one in-flight stream per project.
      if (slot.isStreaming) return;

      const parentNodeId = conversationId
        ? null
        : s.replyToNodeId ?? s.activePath[s.activePath.length - 1] ?? null;

      sessionDispatch({ type: "STREAM_START", projectSlug, conversationId: convId });

      const callbacks = makeCallbacks(projectSlug, convId);
      callbacks.onUserNode = (node) => {
        sessionDispatch({ type: "APPEND_USER_NODE", projectSlug, node });
      };

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await sendMessage(projectSlug, convId, parentNodeId, text, callbacks, controller.signal);
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [sessionDispatch, makeCallbacks],
  );

  const regenerate = useCallback(
    async (userNodeId: string) => {
      const p = projectStateRef.current;
      const s = sessionStateRef.current;
      if (!s.activeConversationId || !p.activeProjectSlug) return;

      const projectSlug = p.activeProjectSlug;
      const slot = selectStreamSlot(s, projectSlug);
      if (slot.isStreaming) return;

      sessionDispatch({
        type: "STREAM_START",
        projectSlug,
        conversationId: s.activeConversationId,
      });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await regenerateResponse(
          projectSlug,
          s.activeConversationId,
          userNodeId,
          makeCallbacks(projectSlug, s.activeConversationId),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [sessionDispatch, makeCallbacks],
  );

  const activeSlot = selectStreamSlot(sessionState, projectState.activeProjectSlug);
  return { send, regenerate, isStreaming: activeSlot.isStreaming };
}
