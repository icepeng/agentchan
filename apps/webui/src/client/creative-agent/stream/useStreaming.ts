import { useCallback, useEffect, useRef } from "react";
import { mutate as globalMutate } from "swr";
import { useAgentStream } from "../useAgentStream.js";
import { useRecordAgentEvent } from "../useRecordAgentEvent.js";
import { useAgentStreamDispatch } from "./AgentStreamStoreContext.js";
import {
  useActiveSessionSelection,
  useSessionData,
  insertEntries,
  replaceTempEntry,
  selectBranchMessages,
  sendMessage,
  regenerateResponse,
  registerAbortController,
  clearAbortController,
  type SessionData,
  type SessionEntry,
  type SessionMessageEntry,
  type SSECallbacks,
} from "@/client/creative-agent/session/index.js";
import { qk } from "@/client/platform/index.js";
import { useI18n } from "@/client/platform/index.js";
import {
  isBackgroundStream,
  notifyBackgroundCompletion,
} from "@/client/platform/index.js";
import { useSessionRoot } from "../SessionRootContext.js";

function makeTempUserEntry(text: string, parentId: string | null): SessionMessageEntry {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    type: "message",
    id: tempId,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: text,
      timestamp: Date.now(),
    },
  };
}

export function useStreaming() {
  const root = useSessionRoot();
  const agentDispatch = useAgentStreamDispatch();
  const recordAgentEvent = useRecordAgentEvent();
  const activeSelection = useActiveSessionSelection();
  const { t } = useI18n();

  const activeSlug = root.slug;
  const activeState = useAgentStream(activeSlug);

  const { data: activeSessionData } = useSessionData(
    activeSlug,
    activeSelection.openSessionId,
  );

  const rootRef = useRef(root);
  const activeStateRef = useRef(activeState);
  const activeSelectionRef = useRef(activeSelection);
  const activeSessionDataRef = useRef(activeSessionData);
  const tRef = useRef(t);
  useEffect(() => {
    rootRef.current = root;
    activeStateRef.current = activeState;
    activeSelectionRef.current = activeSelection;
    activeSessionDataRef.current = activeSessionData;
    tRef.current = t;
  });

  const selectProjectFromNotification = useCallback(async (projectSlug: string) => {
    if (rootRef.current.slug === projectSlug) return;
    rootRef.current.onRequestProjectActivation(projectSlug);
  }, []);

  // Hydrate AgentState whenever the underlying session/branch changes.
  // Reducer guards HYDRATE while streaming, so events stay authoritative.
  const hydrateFromSession = useCallback(
    (projectSlug: string, data: SessionData) => {
      if (activeStateRef.current.isStreaming && projectSlug === activeSlug) return;
      const messages = selectBranchMessages(data.entries, data.leafId);
      agentDispatch({ type: "HYDRATE", projectSlug, messages });
    },
    [activeSlug, agentDispatch],
  );
  useEffect(() => {
    if (!activeSlug || !activeSessionData) return;
    hydrateFromSession(activeSlug, activeSessionData);
  }, [activeSlug, activeSessionData, hydrateFromSession]);

  /**
   * SSE callback factory. `tempUserId` (when non-null) is the optimistic temp
   * entry id we want the server's first echoed entry to replace.
   */
  const makeCallbacks = useCallback(
    (projectSlug: string, sessionId: string, tempUserId: string | null): SSECallbacks => {
      const key = qk.session(projectSlug, sessionId);

      const fireBackgroundNotification = (
        kind: "done" | "error",
        errorMessage?: string,
      ) => {
        const activeSlugNow = rootRef.current.slug;
        const activeSessionIdNow = rootRef.current.sessionId;
        const projectName = projectSlug;
        if (!isBackgroundStream(projectSlug, sessionId, activeSlugNow, activeSessionIdNow)) return;
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
            void selectProjectFromNotification(projectSlug);
          },
        });
      };

      // Track whether we've already consumed the temp swap (only for the very
      // first persisted entry of a send flow). Subsequent batches just append.
      let tempConsumed = tempUserId === null;

      return {
        onEntries: (entries: SessionEntry[]) => {
          if (entries.length === 0) return;
          void globalMutate<SessionData>(
            key,
            (cur) => {
              if (!cur) return cur;
              let next = cur.entries;
              if (!tempConsumed && tempUserId) {
                next = replaceTempEntry(next, tempUserId, entries[0]!);
                if (entries.length > 1) {
                  next = insertEntries(next, entries.slice(1));
                }
                tempConsumed = true;
              } else {
                next = insertEntries(next, entries);
              }
              return {
                ...cur,
                entries: next,
                leafId: entries[entries.length - 1]!.id,
              };
            },
            { revalidate: false },
          );
        },
        onAgentEvent: (event) => {
          recordAgentEvent(projectSlug, event);
        },
        onDone: () => {
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
    [agentDispatch, recordAgentEvent, selectProjectFromNotification],
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      const projectSlug = rootRef.current.slug;
      if (!projectSlug) return;
      const selection = activeSelectionRef.current;
      const sid = sessionId ?? selection.openSessionId;
      if (!sid) return;
      if (activeStateRef.current.isStreaming) return;

      // leafId resolution: explicit fresh-session create > reply-to override > current cached leaf.
      const data = activeSessionDataRef.current;
      const sameSession = data?.info.id === sid;
      const cachedLeaf = sameSession ? data?.leafId ?? null : null;
      const leafId = sessionId
        ? null
        : selection.replyToEntryId ?? cachedLeaf;

      // Optimistic temp user entry. Server echoes the persisted version on
      // the first `entries_persisted` SSE row, where we'll splice in the real id.
      const tempEntry = makeTempUserEntry(text, leafId);
      const key = qk.session(projectSlug, sid);
      const updated = await globalMutate<SessionData>(
        key,
        (cur) => {
          if (!cur) return cur;
          return {
            ...cur,
            entries: insertEntries(cur.entries, [tempEntry]),
            leafId: tempEntry.id,
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
          leafId,
          text,
          makeCallbacks(projectSlug, sid, tempEntry.id),
          controller.signal,
        );
      } finally {
        clearAbortController(projectSlug, controller);
      }
    },
    [agentDispatch, hydrateFromSession, makeCallbacks],
  );

  const regenerate = async (entryId: string) => {
    const projectSlug = rootRef.current.slug;
    if (!projectSlug) return;
    const selection = activeSelectionRef.current;
    if (!selection.openSessionId) return;
    if (activeStateRef.current.isStreaming) return;

    const data = activeSessionDataRef.current;
    if (data?.info.id === selection.openSessionId) {
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
        makeCallbacks(projectSlug, selection.openSessionId, null),
        controller.signal,
      );
    } finally {
      clearAbortController(projectSlug, controller);
    }
  };

  return { send, regenerate, isStreaming: activeState.isStreaming };
}
