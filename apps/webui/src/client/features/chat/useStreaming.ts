import { useCallback, useEffect, useRef } from "react";
import { mutate as globalMutate } from "swr";
import { useProjectState, useProjects } from "@/client/entities/project/index.js";
import {
  useProjectRuntimeState,
  useProjectRuntimeDispatch,
  useActiveRuntime,
  selectRuntime,
  selectStreamSlot,
} from "@/client/entities/project-runtime/index.js";
import {
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
  const projectState = useProjectState();
  const { data: projects } = useProjects();
  const runtimeState = useProjectRuntimeState();
  const runtimeDispatch = useProjectRuntimeDispatch();
  const runtime = useActiveRuntime();
  const { t } = useI18n();
  // Needed so notification onClick can perform a full project switch
  // (fetchSessions + fetchSkills) — not just flip activeProjectSlug,
  // which would leave the target project's SWR caches cold.
  const { selectProject } = useProject();

  // Live data for the current active session so send/regenerate can
  // compute the parent node without re-fetching. Refs avoid re-creating the
  // callbacks on every delta.
  const { data: activeSessionData } = useSessionData(
    projectState.activeProjectSlug,
    runtime.sessionId,
  );

  const projectStateRef = useRef(projectState);
  useEffect(() => { projectStateRef.current = projectState; });
  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; });
  const runtimeStateRef = useRef(runtimeState);
  useEffect(() => { runtimeStateRef.current = runtimeState; });
  const activeSessionDataRef = useRef(activeSessionData);
  useEffect(() => { activeSessionDataRef.current = activeSessionData; });
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const selectProjectRef = useRef(selectProject);
  useEffect(() => { selectProjectRef.current = selectProject; });

  /**
   * Shared streaming callbacks — write-through SWR for persisted state (user
   * node, assistant nodes), reducer for in-flight ephemera (streamingText,
   * tool call input deltas, usage delta). `projectSlug` + `sessionId`
   * are captured in closure so mutations and dispatches route to the right
   * cache key / runtime slot even after the user switches projects.
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
        const p = projectStateRef.current;
        const s = runtimeStateRef.current;
        const projectName =
          projectsRef.current?.find((pr) => pr.slug === projectSlug)?.name ?? projectSlug;
        const activeSessionId = selectRuntime(s, p.activeProjectSlug).sessionId;
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
            if (projectStateRef.current.activeProjectSlug !== projectSlug) {
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
          runtimeDispatch({ type: "STREAM_TEXT_DELTA", projectSlug, text }),
        onToolUseStart: (id, name) =>
          runtimeDispatch({ type: "STREAM_TOOL_START", projectSlug, id, name }),
        onToolUseDelta: (id, inputJson) =>
          runtimeDispatch({ type: "STREAM_TOOL_DELTA", projectSlug, id, inputJson }),
        onToolUseEnd: (id) =>
          runtimeDispatch({ type: "STREAM_TOOL_END", projectSlug, id }),
        onToolExecStart: (id, _name, parallel) =>
          runtimeDispatch({ type: "TOOL_EXEC_START", projectSlug, id, parallel }),
        onToolExecEnd: (id) =>
          runtimeDispatch({ type: "TOOL_EXEC_END", projectSlug, id }),
        onUsageSummary: (usage) =>
          runtimeDispatch({ type: "STREAM_USAGE_SUMMARY", projectSlug, ...usage }),
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
          runtimeDispatch({ type: "STREAM_RESET", projectSlug });
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
          runtimeDispatch({ type: "STREAM_ERROR", projectSlug, error: message });
          // Reconcile — server may have partially persisted, or the temp
          // user node may or may not survive the retry. SWR revalidate gives
          // the authoritative tree.
          void globalMutate(key);
          fireBackgroundNotification("error", message);
        },
      };
    },
    [runtimeDispatch],
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      const p = projectStateRef.current;
      const s = runtimeStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const rt = selectRuntime(s, projectSlug);
      const sid = sessionId ?? rt.sessionId;
      if (!sid) return;

      const slot = selectStreamSlot(s, projectSlug);
      // Per-project concurrency guard: one in-flight stream per project.
      if (slot.isStreaming) return;

      // Parent: explicit reply-to > last activePath node > null.
      // For freshly-created sessions (`sessionId` passed in), there is
      // no prior activePath in the current runtime ref, so pass null.
      const data = activeSessionDataRef.current;
      const sameSession = data?.session.id === sid;
      const lastActive = sameSession
        ? data?.activePath[data.activePath.length - 1] ?? null
        : null;
      const parentNodeId = sessionId
        ? null
        : rt.replyToNodeId ?? lastActive ?? null;

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

      runtimeDispatch({ type: "STREAM_START", projectSlug, sessionId: sid });

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
    [runtimeDispatch, makeCallbacks],
  );

  const regenerate = useCallback(
    async (userNodeId: string) => {
      const p = projectStateRef.current;
      const s = runtimeStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const rt = selectRuntime(s, projectSlug);
      if (!rt.sessionId) return;

      const slot = selectStreamSlot(s, projectSlug);
      if (slot.isStreaming) return;

      runtimeDispatch({
        type: "STREAM_START",
        projectSlug,
        sessionId: rt.sessionId,
      });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await regenerateResponse(
          projectSlug,
          rt.sessionId,
          userNodeId,
          makeCallbacks(projectSlug, rt.sessionId, null),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [runtimeDispatch, makeCallbacks],
  );

  const activeSlot = selectStreamSlot(runtimeState, projectState.activeProjectSlug);
  return { send, regenerate, isStreaming: activeSlot.isStreaming };
}
