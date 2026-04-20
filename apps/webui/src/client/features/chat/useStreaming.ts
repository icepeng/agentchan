import { useCallback, useEffect, useRef } from "react";
import { mutate as globalMutate } from "swr";
import {
  useProjectSelectionState,
  useProjects,
} from "@/client/entities/project/index.js";
import {
  useAgentState,
  useAgentStateDispatch,
} from "@/client/entities/agent-state/index.js";
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
  flattenActivePathToMessages,
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
  const agentDispatch = useAgentStateDispatch();
  const sessionSelectionState = useSessionSelectionState();
  const { t } = useI18n();
  // Notification onClick needs a full project switch (sessions + skills SWR
  // warm-up), not just a slug flip.
  const { selectProject } = useProject();

  const activeSlug = projectSelection.activeProjectSlug;
  const activeSelection = selectSessionSelection(sessionSelectionState, activeSlug);
  const activeState = useAgentState(activeSlug);

  const { data: activeSessionData } = useSessionData(
    activeSlug,
    activeSelection.openSessionId,
  );

  const projectSelectionRef = useRef(projectSelection);
  const projectsRef = useRef(projects);
  const activeStateRef = useRef(activeState);
  const sessionSelectionStateRef = useRef(sessionSelectionState);
  const activeSessionDataRef = useRef(activeSessionData);
  const tRef = useRef(t);
  const selectProjectRef = useRef(selectProject);
  useEffect(() => {
    projectSelectionRef.current = projectSelection;
    projectsRef.current = projects;
    activeStateRef.current = activeState;
    sessionSelectionStateRef.current = sessionSelectionState;
    activeSessionDataRef.current = activeSessionData;
    tRef.current = t;
    selectProjectRef.current = selectProject;
  });

  // SWR activePath change ≡ re-init (session / branch / project switch).
  // Reducer guards HYDRATE while streaming, so events stay authoritative.
  const hydrateFromSession = useCallback(
    (projectSlug: string, data: SessionData) => {
      if (activeStateRef.current.isStreaming && projectSlug === activeSlug) return;
      const messages = flattenActivePathToMessages(data.nodes, data.activePath);
      agentDispatch({ type: "HYDRATE", projectSlug, messages });
    },
    [activeSlug, agentDispatch],
  );
  useEffect(() => {
    if (!activeSlug || !activeSessionData) return;
    hydrateFromSession(activeSlug, activeSessionData);
  }, [activeSlug, activeSessionData, hydrateFromSession]);

  // projectSlug + sessionId captured in closure so cache writes and agent-state
  // dispatches stay routed to the originating stream after a project switch.
  // tempUserId: optimistic user-node id to replace on server echo; null for
  // regenerate (no temp node).
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
        onAgentEvent: (event) =>
          agentDispatch({ type: "AGENT_EVENT", projectSlug, event }),
        onAssistantNodes: (nodes) => {
          // Write-through so activePath updates synchronously; the HYDRATE
          // effect then re-keys state.messages to tree-backed references.
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
        },
        onDone: () => {
          // Revalidate to pick up server-side side effects (title, compact, …).
          void globalMutate(key);
          void globalMutate(qk.sessions(projectSlug));
          fireBackgroundNotification("done");
        },
        onError: (message) => {
          console.error("Stream error:", message);
          agentDispatch({ type: "ERROR", projectSlug, message });
          void globalMutate(key);
          fireBackgroundNotification("error", message);
        },
      };
    },
    [agentDispatch],
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      const p = projectSelectionRef.current;
      const sel = sessionSelectionStateRef.current;
      if (!p.activeProjectSlug) return;
      const projectSlug = p.activeProjectSlug;
      const selection = selectSessionSelection(sel, projectSlug);
      const sid = sessionId ?? selection.openSessionId;
      if (!sid) return;

      // Per-project concurrency guard: one in-flight stream per project.
      if (activeStateRef.current.isStreaming) return;

      // Parent: explicit reply-to > last activePath node > null. Freshly-created
      // sessions (`sessionId` passed in) have no prior activePath.
      const data = activeSessionDataRef.current;
      const sameSession = data?.session.id === sid;
      const lastActive = sameSession
        ? data?.activePath[data.activePath.length - 1] ?? null
        : null;
      const parentNodeId = sessionId
        ? null
        : selection.replyToNodeId ?? lastActive ?? null;

      // Optimistic user bubble — server persists the real node before streaming;
      // `onUserNode` echoes back and we splice in the real id.
      // `rollbackOnError: false`: keep the bubble on SSE break (server wrote it).
      const tempNode = makeTempUserNode(text, parentNodeId);
      const key = qk.session(projectSlug, sid);
      const updated = await globalMutate<SessionData>(
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

      // HYDRATE before START so the optimistic user message is visible before
      // the reducer's isStreaming guard locks further HYDRATEs.
      if (updated) hydrateFromSession(projectSlug, updated);
      agentDispatch({ type: "START", projectSlug });

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
    [agentDispatch, hydrateFromSession, makeCallbacks],
  );

  const regenerate = async (userNodeId: string) => {
    const p = projectSelectionRef.current;
    const sel = sessionSelectionStateRef.current;
    if (!p.activeProjectSlug) return;
    const projectSlug = p.activeProjectSlug;
    const selection = selectSessionSelection(sel, projectSlug);
    if (!selection.openSessionId) return;

    if (activeStateRef.current.isStreaming) return;

    const data = activeSessionDataRef.current;
    if (data?.session.id === selection.openSessionId) {
      hydrateFromSession(projectSlug, data);
    }
    agentDispatch({ type: "START", projectSlug });

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
  };

  return { send, regenerate, isStreaming: activeState.isStreaming };
}
