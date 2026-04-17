import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useActiveSession,
  useSessionDispatch,
} from "@/client/entities/session/index.js";
import { useConversationMutations } from "@/client/entities/conversation/index.js";
import { qk } from "@/client/shared/queryKeys.js";

export function useConversation() {
  const projectState = useProjectState();
  const activeSession = useActiveSession();
  const sessionDispatch = useSessionDispatch();
  const slug = projectState.activeProjectSlug;
  const mutations = useConversationMutations(slug);
  const { mutate } = useSWRConfig();

  const create = useCallback(async (mode?: "creative" | "meta") => {
    if (!slug) return;
    const { conversation } = await mutations.create(mode);
    sessionDispatch({
      type: "SET_ACTIVE_CONVERSATION",
      projectSlug: slug,
      conversationId: conversation.id,
    });
    return conversation;
  }, [slug, mutations, sessionDispatch]);

  const load = useCallback(
    async (id: string) => {
      if (!slug) return;
      // Let SWR fetch via its own route table — the detail cache hydrates
      // under `qk.conversation(slug, id)` before the selection flips, so
      // subscribers see canonical data on the next render.
      await mutate(qk.conversation(slug, id));
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        projectSlug: slug,
        conversationId: id,
      });
    },
    [slug, sessionDispatch, mutate],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!slug) return;
      await mutations.remove(id);
      if (activeSession.conversationId === id) {
        sessionDispatch({
          type: "SET_ACTIVE_CONVERSATION",
          projectSlug: slug,
          conversationId: null,
        });
      }
    },
    [slug, mutations, sessionDispatch, activeSession.conversationId],
  );

  const refresh = useCallback(async () => {
    if (!slug) return;
    await mutate(qk.conversations(slug));
  }, [slug, mutate]);

  const switchBranch = useCallback(
    async (nodeId: string) => {
      if (!activeSession.conversationId || !slug) return;
      await mutations.switchBranch(activeSession.conversationId, nodeId);
    },
    [activeSession.conversationId, slug, mutations],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!activeSession.conversationId || !slug) return;
      await mutations.removeNode(activeSession.conversationId, nodeId);
    },
    [activeSession.conversationId, slug, mutations],
  );

  const setReplyTo = useCallback(
    (nodeId: string | null) => {
      if (!slug) return;
      sessionDispatch({ type: "SET_REPLY_TO", projectSlug: slug, nodeId });
    },
    [slug, sessionDispatch],
  );

  const compact = useCallback(async () => {
    if (!slug || !activeSession.conversationId) return;
    const conversationId = activeSession.conversationId;
    // STREAM_START locks the input while compact runs server-side.
    sessionDispatch({ type: "STREAM_START", projectSlug: slug, conversationId });
    try {
      const result = await mutations.compact(conversationId);
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        projectSlug: slug,
        conversationId: result.conversation.id,
      });
      sessionDispatch({ type: "STREAM_RESET", projectSlug: slug });
    } catch (err) {
      sessionDispatch({
        type: "STREAM_ERROR",
        projectSlug: slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [slug, activeSession.conversationId, mutations, sessionDispatch]);

  return {
    create,
    load,
    remove,
    refresh,
    switchBranch,
    setReplyTo,
    deleteNode,
    compact,
    activeConversationId: activeSession.conversationId,
  };
}
