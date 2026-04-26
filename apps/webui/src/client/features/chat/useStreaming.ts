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
  appendEntriesUnique,
  branchFromLeaf,
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
  type SSECallbacks,
  type AgentMessage,
  type SessionEntry,
  type SessionMessageEntry,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  isBackgroundStream,
  notifyBackgroundCompletion,
} from "@/client/shared/notifications.js";
import { useProject } from "@/client/features/project/useProject.js";

function appendEntriesToData(
  cur: { entries: SessionEntry[]; leafId: string | null },
  entries: readonly SessionEntry[],
): { entries: SessionEntry[]; leafId: string | null } {
  return {
    ...cur,
    entries: appendEntriesUnique(cur.entries, entries),
    leafId: entries[entries.length - 1]?.id ?? cur.leafId,
  };
}

function branchEntryMessages(entries: readonly SessionEntry[], leafId?: string | null): AgentMessage[] {
  return branchFromLeaf(entries, leafId)
    .filter((entry): entry is SessionMessageEntry => entry.type === "message")
    .map((entry) => entry.message);
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

  // SWR branch change ≡ re-init (session / branch / project switch).
  // Reducer guards HYDRATE while streaming, so events stay authoritative.
  const hydrateFromSession = useCallback(
    (projectSlug: string, data: { entries: SessionEntry[]; leafId: string | null }) => {
      if (activeStateRef.current.isStreaming && projectSlug === activeSlug) return;
      const messages = branchEntryMessages(data.entries, data.leafId);
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
  const makeCallbacks = useCallback(
    (projectSlug: string, sessionId: string): SSECallbacks => {
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
        onUserEntries: (realEntries) => {
          void globalMutate<{ entries: SessionEntry[]; leafId: string | null }>(
            key,
            (cur) => {
              if (!cur) return cur;
              return appendEntriesToData(cur, realEntries);
            },
            { revalidate: false },
          );
        },
        onAgentEvent: (event) =>
          agentDispatch({ type: "AGENT_EVENT", projectSlug, event }),
        onAssistantEntries: (entries) => {
          // Write-through so entries + leafId update synchronously; HYDRATE
          // then derives the selected branch from that canonical cache state.
          void globalMutate<{ entries: SessionEntry[]; leafId: string | null }>(
            key,
            (cur) => {
              if (!cur) return cur;
              return appendEntriesToData(cur, entries);
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

      // Leaf: explicit branch target > last selected branch entry > null.
      // Freshly-created sessions (`sessionId` passed in) have no prior branch.
      const data = activeSessionDataRef.current;
      const sameSession = selection.openSessionId === sid;
      const lastActive = sameSession
        ? branchFromLeaf(data?.entries ?? [], data?.leafId).at(-1)?.id ?? null
        : null;
      const leafId = sessionId
        ? null
        : selection.replyToLeafId ?? lastActive ?? null;

      agentDispatch({ type: "START", projectSlug });

      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await sendMessage(
          projectSlug,
          sid,
          leafId,
          text,
          makeCallbacks(projectSlug, sid),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [agentDispatch, hydrateFromSession, makeCallbacks],
  );

  const regenerate = async (entryId: string) => {
    const p = projectSelectionRef.current;
    const sel = sessionSelectionStateRef.current;
    if (!p.activeProjectSlug) return;
    const projectSlug = p.activeProjectSlug;
    const selection = selectSessionSelection(sel, projectSlug);
    if (!selection.openSessionId) return;

    if (activeStateRef.current.isStreaming) return;

    const data = activeSessionDataRef.current;
    if (data && selection.openSessionId) {
      hydrateFromSession(projectSlug, data);
    }
    agentDispatch({ type: "START", projectSlug });

    const controller = new AbortController();
    registerAbortController(projectSlug, controller);
    try {
      await regenerateResponse(
        projectSlug,
        selection.openSessionId,
        entryId,
        makeCallbacks(projectSlug, selection.openSessionId),
        controller.signal,
      );
    } finally {
      clearAbortController(projectSlug, controller);
    }
  };

  return { send, regenerate, isStreaming: activeState.isStreaming };
}
