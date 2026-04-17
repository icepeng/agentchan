import { useCallback, useEffect, useRef } from "react";
import { mutate as globalMutate } from "swr";
import { useProjectState, useProjects } from "@/client/entities/project/index.js";
import {
  useSessionState,
  useSessionDispatch,
  useActiveSession,
  selectSession,
  selectStreamSlot,
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
  type SSECallbacks,
} from "@/client/entities/session/index.js";
import {
  useConversationData,
  insertNode,
  insertNodes,
  replaceTempNode,
  type ConversationData,
  type TreeNode,
  type ClientMessage,
} from "@/client/entities/conversation/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  isBackgroundStream,
  notifyBackgroundCompletion,
} from "@/client/shared/notifications.js";
import { useProject } from "@/client/features/project/useProject.js";

function makeTempUserNode(text: string, parentId: string | null): TreeNode {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message: ClientMessage = {
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
  return {
    id: tempId,
    parentId,
    message,
    createdAt: Date.now(),
  };
}

export function useStreaming() {
  const projectState = useProjectState();
  const { data: projects } = useProjects();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();
  const activeSession = useActiveSession();
  const { t } = useI18n();
  // Needed so notification onClick can perform a full project switch
  // (fetchConversations + fetchSkills) — not just flip activeProjectSlug,
  // which would leave the target project's SWR caches cold.
  const { selectProject } = useProject();

  // Live data for the current active conversation so send/regenerate can
  // compute the parent node without re-fetching. Refs avoid re-creating the
  // callbacks on every delta.
  const { data: activeConvData } = useConversationData(
    projectState.activeProjectSlug,
    activeSession.conversationId,
  );

  const projectStateRef = useRef(projectState);
  useEffect(() => { projectStateRef.current = projectState; });
  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; });
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; });
  const activeConvDataRef = useRef(activeConvData);
  useEffect(() => { activeConvDataRef.current = activeConvData; });
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const selectProjectRef = useRef(selectProject);
  useEffect(() => { selectProjectRef.current = selectProject; });

  /**
   * Shared streaming callbacks — write-through SWR for persisted state (user
   * node, assistant nodes), reducer for in-flight ephemera (streamingText,
   * tool call input deltas, usage delta). `projectSlug` + `conversationId`
   * are captured in closure so mutations and dispatches route to the right
   * cache key / session slot even after the user switches projects.
   *
   * `tempUserId`: the optimistic temp id we inserted for the user message.
   * When the server echoes back `onUserNode` with the real node, we splice
   * it in to replace the temp. Regenerate paths pass null — no temp node.
   */
  const makeCallbacks = useCallback(
    (projectSlug: string, conversationId: string, tempUserId: string | null): SSECallbacks => {
      const key = qk.conversation(projectSlug, conversationId);

      const fireBackgroundNotification = (
        kind: "done" | "error",
        errorMessage?: string,
      ) => {
        const p = projectStateRef.current;
        const s = sessionStateRef.current;
        const projectName =
          projectsRef.current?.find((pr) => pr.slug === projectSlug)?.name ?? projectSlug;
        const activeConversationId = selectSession(s, p.activeProjectSlug).conversationId;
        if (!isBackgroundStream(projectSlug, conversationId, p.activeProjectSlug, activeConversationId)) return;
        notifyBackgroundCompletion({
          projectSlug,
          projectName,
          conversationId,
          kind,
          errorMessage,
          title: tRef.current(
            kind === "done" ? "notifications.sessionComplete" : "notifications.sessionError",
            { project: projectName },
          ),
          body: tRef.current(
            kind === "done" ? "notifications.sessionCompleteBody" : "notifications.sessionErrorBody",
          ),
          onClick: () => {
            if (projectStateRef.current.activeProjectSlug !== projectSlug) {
              void selectProjectRef.current(projectSlug);
            }
          },
        });
      };

      return {
        onUserNode: (realUserNode) => {
          if (tempUserId) {
            void globalMutate<ConversationData>(
              key,
              (cur) => {
                if (!cur) return cur;
                return {
                  ...cur,
                  nodes: replaceTempNode(cur.nodes, tempUserId, realUserNode),
                  activePath: cur.activePath.map((id) =>
                    id === tempUserId ? realUserNode.id : id,
                  ),
                };
              },
              { revalidate: false },
            );
            return;
          }
          // Regenerate path / first message with no temp anchor: insert fresh.
          void globalMutate<ConversationData>(
            key,
            (cur) => {
              if (!cur) return cur;
              return {
                ...cur,
                nodes: insertNode(cur.nodes, realUserNode),
                activePath: cur.activePath.includes(realUserNode.id)
                  ? cur.activePath
                  : [...cur.activePath, realUserNode.id],
              };
            },
            { revalidate: false },
          );
        },
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
          // Write-through: splice persisted assistant nodes into the SWR
          // cache synchronously, then reset the stream slot. Next render
          // pulls nodes from SWR — the streaming bubble (reducer) vanishes,
          // canonical MessageBubbles appear in place.
          void globalMutate<ConversationData>(
            key,
            (cur) => {
              if (!cur) return cur;
              return {
                ...cur,
                nodes: insertNodes(cur.nodes, nodes),
                activePath: [...cur.activePath, ...nodes.map((n) => n.id)],
              };
            },
            { revalidate: false },
          );
          sessionDispatch({ type: "STREAM_RESET", projectSlug });
        },
        onDone: () => {
          // Always revalidate — write-throughs already seeded canonical data
          // but the server may have persisted side effects (updated title,
          // compact triggers, etc.). Key-scoped mutate can't cross-stomp
          // whatever project the user has navigated to, so the old
          // `activeProjectSlug !== projectSlug` guard is gone.
          void globalMutate(key);
          void globalMutate(qk.conversations(projectSlug));
          fireBackgroundNotification("done");
        },
        onError: (message) => {
          console.error("Stream error:", message);
          sessionDispatch({ type: "STREAM_ERROR", projectSlug, error: message });
          // Reconcile — server may have partially persisted, or the temp
          // user node may or may not survive the retry. SWR revalidate gives
          // the authoritative tree.
          void globalMutate(key);
          fireBackgroundNotification("error", message);
        },
      };
    },
    [sessionDispatch],
  );

  const send = useCallback(
    async (text: string, conversationId?: string) => {
      const p = projectStateRef.current;
      const s = sessionStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const session = selectSession(s, projectSlug);
      const convId = conversationId ?? session.conversationId;
      if (!convId) return;

      const slot = selectStreamSlot(s, projectSlug);
      // Per-project concurrency guard: one in-flight stream per project.
      if (slot.isStreaming) return;

      // Parent: explicit reply-to > last activePath node > null.
      // For freshly-created sessions (`conversationId` passed in), there is
      // no prior activePath in the current session ref, so pass null.
      const data = activeConvDataRef.current;
      const sameConv = data?.conversation.id === convId;
      const lastActive = sameConv
        ? data?.activePath[data.activePath.length - 1] ?? null
        : null;
      const parentNodeId = conversationId
        ? null
        : session.replyToNodeId ?? lastActive ?? null;

      // Optimistic user bubble — server persists the real user node before
      // streaming; when `onUserNode` echoes back we replace the temp.
      // `rollbackOnError: false` keeps the bubble on SSE break (server has
      // already written it), matching current UX.
      const tempNode = makeTempUserNode(text, parentNodeId);
      const key = qk.conversation(projectSlug, convId);
      await globalMutate<ConversationData>(
        key,
        (cur) => {
          if (!cur) return cur;
          return {
            ...cur,
            nodes: insertNode(cur.nodes, tempNode),
            activePath: [...cur.activePath, tempNode.id],
          };
        },
        { revalidate: false, rollbackOnError: false },
      );

      sessionDispatch({ type: "STREAM_START", projectSlug, conversationId: convId });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await sendMessage(
          projectSlug,
          convId,
          parentNodeId,
          text,
          makeCallbacks(projectSlug, convId, tempNode.id),
          controller.signal,
        );
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
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const session = selectSession(s, projectSlug);
      if (!session.conversationId) return;

      const slot = selectStreamSlot(s, projectSlug);
      if (slot.isStreaming) return;

      sessionDispatch({
        type: "STREAM_START",
        projectSlug,
        conversationId: session.conversationId,
      });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await regenerateResponse(
          projectSlug,
          session.conversationId,
          userNodeId,
          makeCallbacks(projectSlug, session.conversationId, null),
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
