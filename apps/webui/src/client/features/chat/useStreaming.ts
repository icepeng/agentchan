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
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
  branchToMessages,
  type ProjectSessionState,
  type SSECallbacks,
} from "@/client/entities/session/index.js";
import type { UserMessage } from "@/client/entities/agent-state/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useI18n } from "@/client/i18n/index.js";
import {
  isBackgroundStream,
  notifyBackgroundCompletion,
} from "@/client/shared/notifications.js";
import { useProject } from "@/client/features/project/useProject.js";
import { branchUntil, branchWithAppendedEntry } from "./streamingBranch.js";

export function useStreaming() {
  const projectSelection = useProjectSelectionState();
  const { data: projects } = useProjects();
  const agentDispatch = useAgentStateDispatch();
  const sessionSelectionState = useSessionSelectionState();
  const { t } = useI18n();
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

  const hydrateFromSession = useCallback(
    (projectSlug: string, data: ProjectSessionState) => {
      if (activeStateRef.current.isStreaming && projectSlug === activeSlug) return;
      agentDispatch({
        type: "HYDRATE",
        projectSlug,
        messages: branchToMessages(data.branch),
      });
    },
    [activeSlug, agentDispatch],
  );

  useEffect(() => {
    if (!activeSlug || !activeSessionData) return;
    hydrateFromSession(activeSlug, activeSessionData);
  }, [activeSlug, activeSessionData, hydrateFromSession]);

  const makeCallbacks = useCallback(
    (projectSlug: string, sessionId: string): SSECallbacks => {
      const key = qk.session(projectSlug, sessionId);
      let receivedSnapshot = false;

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
        onEntry: (entry) => {
          void globalMutate<ProjectSessionState>(
            key,
            (cur) => {
              if (!cur) return cur;
              const entries = cur.entries.some((existing) => existing.id === entry.id)
                ? cur.entries
                : [...cur.entries, entry];
              const branch = branchWithAppendedEntry(cur.entries, cur.branch, entry);
              if (entries === cur.entries && branch === cur.branch) return cur;
              return { ...cur, entries, branch, leafId: entry.id };
            },
            { revalidate: false },
          );
        },
        onAgentEvent: (event) =>
          agentDispatch({ type: "AGENT_EVENT", projectSlug, event }),
        onSnapshot: (snapshot) => {
          receivedSnapshot = true;
          void globalMutate<ProjectSessionState>(key, snapshot, { revalidate: false });
        },
        onDone: () => {
          if (!receivedSnapshot) void globalMutate(key);
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
      if (!sid || activeStateRef.current.isStreaming) return;

      const data = activeSessionDataRef.current;
      const sameSession = data?.info.id === sid;
      const parentEntryId = sessionId
        ? null
        : selection.replyToEntryId ?? (sameSession ? data?.leafId ?? null : null);
      const baseMessages =
        sameSession && data
          ? branchToMessages(branchUntil(data.branch, parentEntryId))
          : [];
      const userMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      } satisfies UserMessage;

      agentDispatch({ type: "BEGIN_TURN", projectSlug, messages: baseMessages, userMessage });
      const controller = new AbortController();
      registerAbortController(projectSlug, controller);
      try {
        await sendMessage(
          projectSlug,
          sid,
          parentEntryId,
          text,
          makeCallbacks(projectSlug, sid),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [agentDispatch, makeCallbacks],
  );

  const regenerate = async (userEntryId: string) => {
    const p = projectSelectionRef.current;
    const sel = sessionSelectionStateRef.current;
    if (!p.activeProjectSlug) return;
    const projectSlug = p.activeProjectSlug;
    const selection = selectSessionSelection(sel, projectSlug);
    if (!selection.openSessionId || activeStateRef.current.isStreaming) return;

    const data = activeSessionDataRef.current;
    const baseMessages = data?.info.id === selection.openSessionId
      ? branchToMessages(branchUntil(data.branch, userEntryId))
      : [];
    agentDispatch({ type: "BEGIN_TURN", projectSlug, messages: baseMessages });

    const controller = new AbortController();
    registerAbortController(projectSlug, controller);
    try {
      await regenerateResponse(
        projectSlug,
        selection.openSessionId,
        userEntryId,
        makeCallbacks(projectSlug, selection.openSessionId),
        controller.signal,
      );
    } finally {
      clearAbortController(projectSlug, controller);
    }
  };

  return { send, regenerate, isStreaming: activeState.isStreaming };
}
