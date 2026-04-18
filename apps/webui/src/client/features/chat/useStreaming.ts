import { useCallback, useEffect, useRef } from "react";
import { mutate as globalMutate } from "swr";
import {
  useProjectSelectionState,
  useProjects,
} from "@/client/entities/project/index.js";
import {
  useStreamState,
  useStreamDispatch,
  selectStreamSlot,
} from "@/client/entities/stream/index.js";
import {
  useSessionSelectionState,
  selectSessionSelection,
  useSessionData,
  insertNode,
  insertNodes,
  replaceTempNode,
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
  type SessionData,
  type TreeNode,
  type ClientMessage,
  type SSECallbacks,
} from "@/client/entities/session/index.js";
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
  const projectSelection = useProjectSelectionState();
  const { data: projects } = useProjects();
  const streamState = useStreamState();
  const streamDispatch = useStreamDispatch();
  const sessionSelectionState = useSessionSelectionState();
  const { t } = useI18n();
  // Needed so notification onClick can perform a full project switch
  // (fetchSessions + fetchSkills) — not just flip activeProjectSlug,
  // which would leave the target project's SWR caches cold.
  const { selectProject } = useProject();

  const activeSlug = projectSelection.activeProjectSlug;
  const activeSelection = selectSessionSelection(sessionSelectionState, activeSlug);
  const activeSlot = selectStreamSlot(streamState, activeSlug);

  // Live data for the current active session so send/regenerate can
  // compute the parent node without re-fetching. Refs avoid re-creating the
  // callbacks on every delta.
  const { data: activeSessionData } = useSessionData(
    activeSlug,
    activeSelection.openSessionId,
  );

  const projectSelectionRef = useRef(projectSelection);
  useEffect(() => { projectSelectionRef.current = projectSelection; });
  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; });
  const streamStateRef = useRef(streamState);
  useEffect(() => { streamStateRef.current = streamState; });
  const sessionSelectionStateRef = useRef(sessionSelectionState);
  useEffect(() => { sessionSelectionStateRef.current = sessionSelectionState; });
  const activeSessionDataRef = useRef(activeSessionData);
  useEffect(() => { activeSessionDataRef.current = activeSessionData; });
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const selectProjectRef = useRef(selectProject);
  useEffect(() => { selectProjectRef.current = selectProject; });

  /**
   * Shared streaming callbacks — write-through SWR for persisted state (user
   * node, assistant nodes), reducer for in-flight ephemera (text,
   * tool call input deltas, usage delta). `projectSlug` + `sessionId`
   * are captured in closure so mutations and dispatches route to the right
   * cache key / stream slot even after the user switches projects.
   *
   * `tempUserId`: the optimistic temp id we inserted for the user message.
   * When the server echoes back `onUserNode` with the real node, we splice
   * it in to replace the temp. Regenerate paths pass null — no temp node.
   */
  const makeCallbacks = useCallback(
    (projectSlug: string, sessionId: string, tempUserId: string | null): SSECallbacks => {
      const key = qk.session(projectSlug, sessionId);

      const fireBackgroundNotification = (
        kind: "done" | "error",
        errorMessage?: string,
      ) => {
        const p = projectSelectionRef.current;
        const sel = sessionSelectionStateRef.current;
        const projectName =
          projectsRef.current?.find((pr) => pr.slug === projectSlug)?.name ?? projectSlug;
        const activeSessionId = selectSessionSelection(sel, p.activeProjectSlug).openSessionId;
        if (!isBackgroundStream(projectSlug, sessionId, p.activeProjectSlug, activeSessionId)) return;
        notifyBackgroundCompletion({
          projectSlug,
          projectName,
          sessionId,
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
            if (projectSelectionRef.current.activeProjectSlug !== projectSlug) {
              void selectProjectRef.current(projectSlug);
            }
          },
        });
      };

      return {
        onUserNode: (realUserNode) => {
          if (tempUserId) {
            void globalMutate<SessionData>(
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
          void globalMutate<SessionData>(
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
          streamDispatch({ type: "TEXT_DELTA", projectSlug, text }),
        onToolUseStart: (id, name) =>
          streamDispatch({ type: "TOOL_START", projectSlug, id, name }),
        onToolUseDelta: (id, inputJson) =>
          streamDispatch({ type: "TOOL_DELTA", projectSlug, id, inputJson }),
        onToolUseEnd: (id) =>
          streamDispatch({ type: "TOOL_END", projectSlug, id }),
        onToolExecStart: (id, _name, parallel) =>
          streamDispatch({ type: "TOOL_EXEC_START", projectSlug, id, parallel }),
        onToolExecEnd: (id, isError) =>
          streamDispatch({ type: "TOOL_EXEC_END", projectSlug, id, isError }),
        onUsageSummary: (usage) =>
          streamDispatch({ type: "USAGE_SUMMARY", projectSlug, ...usage }),
        onAssistantNodes: (nodes) => {
          // Write-through: splice persisted assistant nodes into the SWR
          // cache synchronously, then reset the stream slot. Next render
          // pulls nodes from SWR — the streaming bubble (reducer) vanishes,
          // canonical MessageBubbles appear in place.
          void globalMutate<SessionData>(
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
          streamDispatch({ type: "RESET", projectSlug });
        },
        onDone: () => {
          // Always revalidate — write-throughs already seeded canonical data
          // but the server may have persisted side effects (updated title,
          // compact triggers, etc.). Key-scoped mutate can't cross-stomp
          // whatever project the user has navigated to, so the old
          // `activeProjectSlug !== projectSlug` guard is gone.
          void globalMutate(key);
          void globalMutate(qk.sessions(projectSlug));
          fireBackgroundNotification("done");
        },
        onError: (message) => {
          console.error("Stream error:", message);
          streamDispatch({ type: "ERROR", projectSlug, error: message });
          // Reconcile — server may have partially persisted, or the temp
          // user node may or may not survive the retry. SWR revalidate gives
          // the authoritative tree.
          void globalMutate(key);
          fireBackgroundNotification("error", message);
        },
      };
    },
    [streamDispatch],
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      const p = projectSelectionRef.current;
      const sel = sessionSelectionStateRef.current;
      const streams = streamStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const selection = selectSessionSelection(sel, projectSlug);
      const sid = sessionId ?? selection.openSessionId;
      if (!sid) return;

      const slot = selectStreamSlot(streams, projectSlug);
      // Per-project concurrency guard: one in-flight stream per project.
      if (slot.isStreaming) return;

      // Parent: explicit reply-to > last activePath node > null.
      // For freshly-created sessions (`sessionId` passed in), there is
      // no prior activePath in the current ref, so pass null.
      const data = activeSessionDataRef.current;
      const sameSession = data?.session.id === sid;
      const lastActive = sameSession
        ? data?.activePath[data.activePath.length - 1] ?? null
        : null;
      const parentNodeId = sessionId
        ? null
        : selection.replyToNodeId ?? lastActive ?? null;

      // Optimistic user bubble — server persists the real user node before
      // streaming; when `onUserNode` echoes back we replace the temp.
      // `rollbackOnError: false` keeps the bubble on SSE break (server has
      // already written it), matching current UX.
      const tempNode = makeTempUserNode(text, parentNodeId);
      const key = qk.session(projectSlug, sid);
      await globalMutate<SessionData>(
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

      streamDispatch({ type: "START", projectSlug });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await sendMessage(
          projectSlug,
          sid,
          parentNodeId,
          text,
          makeCallbacks(projectSlug, sid, tempNode.id),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [streamDispatch, makeCallbacks],
  );

  const regenerate = useCallback(
    async (userNodeId: string) => {
      const p = projectSelectionRef.current;
      const sel = sessionSelectionStateRef.current;
      const streams = streamStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const selection = selectSessionSelection(sel, projectSlug);
      if (!selection.openSessionId) return;

      const slot = selectStreamSlot(streams, projectSlug);
      if (slot.isStreaming) return;

      streamDispatch({ type: "START", projectSlug });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await regenerateResponse(
          projectSlug,
          selection.openSessionId,
          userNodeId,
          makeCallbacks(projectSlug, selection.openSessionId, null),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [streamDispatch, makeCallbacks],
  );

  return { send, regenerate, isStreaming: activeSlot.isStreaming };
}
