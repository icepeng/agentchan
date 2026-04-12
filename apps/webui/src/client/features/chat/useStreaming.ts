import { useCallback, useEffect, useRef } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useSessionState,
  useSessionDispatch,
  sendMessage,
  regenerateResponse,
  fetchConversation,
  type SSECallbacks,
} from "@/client/entities/session/index.js";

export function useStreaming() {
  const projectState = useProjectState();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();

  const projectStateRef = useRef(projectState);
  useEffect(() => { projectStateRef.current = projectState; });
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; });

  /** Shared streaming callbacks — identical for send and regenerate. */
  const makeCallbacks = useCallback(
    (projectSlug: string, conversationId: string): SSECallbacks => {
      // Track the effective conversation ID — may change on session_redirect
      let effectiveConvId = conversationId;
      return {
        onUserNode: () => {},
        onTextDelta: (text) => sessionDispatch({ type: "STREAM_TEXT_DELTA", text }),
        onToolUseStart: (id, name) => sessionDispatch({ type: "STREAM_TOOL_START", id, name }),
        onToolUseDelta: (id, inputJson) => sessionDispatch({ type: "STREAM_TOOL_DELTA", id, inputJson }),
        onToolUseEnd: (id) => sessionDispatch({ type: "STREAM_TOOL_END", id }),
        onToolExecStart: (id, _name, parallel) => sessionDispatch({ type: "TOOL_EXEC_START", id, parallel }),
        onToolExecEnd: (id) => sessionDispatch({ type: "TOOL_EXEC_END", id }),
        onUsageSummary: (usage) =>
          sessionDispatch({ type: "STREAM_USAGE_SUMMARY", ...usage }),
        onSessionRedirect: (conversation) => {
          effectiveConvId = conversation.id;
          sessionDispatch({ type: "NEW_CONVERSATION", conversation });
        },
        onAssistantNodes: (nodes) => {
          sessionDispatch({ type: "STREAM_COMPLETE", nodes });
          sessionDispatch({ type: "STREAM_RESET" });
        },
        onDone: () => {
          void fetchConversation(projectSlug, effectiveConvId).then((data) => {
            sessionDispatch({ type: "SET_ACTIVE_CONVERSATION", conversation: data.conversation, nodes: data.nodes, activePath: data.activePath });
          }).catch(() => { /* keep current state */ });
        },
        onError: (message) => {
          console.error("Stream error:", message);
          sessionDispatch({ type: "STREAM_ERROR", error: message });
        },
      };
    },
    [sessionDispatch],
  );

  const send = useCallback(
    async (text: string) => {
      const p = projectStateRef.current;
      const s = sessionStateRef.current;
      if (!s.activeConversationId || !p.activeProjectSlug || s.isStreaming) return;

      const projectSlug = p.activeProjectSlug;
      const conversationId = s.activeConversationId;
      const parentNodeId = s.replyToNodeId ?? s.activePath[s.activePath.length - 1] ?? null;

      sessionDispatch({ type: "STREAM_START" });

      const callbacks = makeCallbacks(projectSlug, conversationId);
      callbacks.onUserNode = (node) => {
        sessionDispatch({ type: "APPEND_USER_NODE", node });
      };

      await sendMessage(projectSlug, conversationId, parentNodeId, text, callbacks);
    },
    [sessionDispatch, makeCallbacks],
  );

  /** Send the first message to a just-created conversation.
   *  Bypasses the ref so it works before React re-renders. */
  const sendFirst = useCallback(
    async (text: string, conversationId: string) => {
      const projectSlug = projectStateRef.current.activeProjectSlug;
      if (!projectSlug) return;

      sessionDispatch({ type: "STREAM_START" });

      const callbacks = makeCallbacks(projectSlug, conversationId);
      callbacks.onUserNode = (node) => {
        sessionDispatch({ type: "APPEND_USER_NODE", node });
      };

      await sendMessage(projectSlug, conversationId, null, text, callbacks);
    },
    [sessionDispatch, makeCallbacks],
  );

  const regenerate = useCallback(
    async (userNodeId: string) => {
      const p = projectStateRef.current;
      const s = sessionStateRef.current;
      if (!s.activeConversationId || !p.activeProjectSlug || s.isStreaming) return;

      sessionDispatch({ type: "STREAM_START" });
      await regenerateResponse(
        p.activeProjectSlug, s.activeConversationId, userNodeId,
        makeCallbacks(p.activeProjectSlug, s.activeConversationId),
      );
    },
    [sessionDispatch, makeCallbacks],
  );

  return { send, sendFirst, regenerate, isStreaming: sessionState.isStreaming };
}
