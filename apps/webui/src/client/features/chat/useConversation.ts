import { useCallback } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useActiveSession,
  useSessionDispatch,
  createConversation as apiCreate,
  fetchConversation,
  deleteConversation as apiDelete,
  deleteNode as apiDeleteNode,
  switchBranch as apiSwitchBranch,
  fetchConversations,
  compactConversation as apiCompact,
} from "@/client/entities/session/index.js";
import { useConversationDispatch } from "@/client/entities/conversation/index.js";

export function useConversation() {
  const projectState = useProjectState();
  const activeSession = useActiveSession();
  const sessionDispatch = useSessionDispatch();
  const conversationDispatch = useConversationDispatch();

  const create = useCallback(async (mode?: "creative" | "meta") => {
    if (!projectState.activeProjectSlug) return;
    const projectSlug = projectState.activeProjectSlug;
    const { conversation, nodes } = await apiCreate(projectSlug, mode);
    conversationDispatch({ type: "ADD", projectSlug, conversation });
    sessionDispatch({ type: "NEW_CONVERSATION", projectSlug, conversationId: conversation.id, nodes });
    return conversation;
  }, [projectState.activeProjectSlug, sessionDispatch, conversationDispatch]);

  const load = useCallback(
    async (id: string) => {
      if (!projectState.activeProjectSlug) return;
      const projectSlug = projectState.activeProjectSlug;
      const data = await fetchConversation(projectSlug, id);
      conversationDispatch({ type: "UPDATE", projectSlug, conversation: data.conversation });
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        projectSlug,
        conversationId: data.conversation.id,
        nodes: data.nodes,
        activePath: data.activePath,
      });
    },
    [projectState.activeProjectSlug, sessionDispatch, conversationDispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!projectState.activeProjectSlug) return;
      const projectSlug = projectState.activeProjectSlug;
      await apiDelete(projectSlug, id);
      conversationDispatch({ type: "DELETE", projectSlug, conversationId: id });
      sessionDispatch({ type: "DELETE_CONVERSATION", projectSlug, conversationId: id });
    },
    [projectState.activeProjectSlug, sessionDispatch, conversationDispatch],
  );

  const refresh = useCallback(async () => {
    if (!projectState.activeProjectSlug) return;
    const projectSlug = projectState.activeProjectSlug;
    const conversations = await fetchConversations(projectSlug);
    conversationDispatch({ type: "SET_FOR_PROJECT", projectSlug, conversations });
  }, [projectState.activeProjectSlug, conversationDispatch]);

  const switchBranch = useCallback(
    async (nodeId: string) => {
      if (!activeSession.conversationId || !projectState.activeProjectSlug) return;
      const projectSlug = projectState.activeProjectSlug;
      const result = await apiSwitchBranch(projectSlug, activeSession.conversationId, nodeId);
      sessionDispatch({ type: "SET_ACTIVE_PATH", projectSlug, activePath: result.activePath });
    },
    [activeSession.conversationId, projectState.activeProjectSlug, sessionDispatch],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!activeSession.conversationId || !projectState.activeProjectSlug) return;
      const projectSlug = projectState.activeProjectSlug;
      await apiDeleteNode(projectSlug, activeSession.conversationId, nodeId);
      const data = await fetchConversation(projectSlug, activeSession.conversationId);
      conversationDispatch({ type: "UPDATE", projectSlug, conversation: data.conversation });
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        projectSlug,
        conversationId: data.conversation.id,
        nodes: data.nodes,
        activePath: data.activePath,
      });
    },
    [activeSession.conversationId, projectState.activeProjectSlug, sessionDispatch, conversationDispatch],
  );

  const setReplyTo = useCallback(
    (nodeId: string | null) => {
      if (!projectState.activeProjectSlug) return;
      sessionDispatch({ type: "SET_REPLY_TO", projectSlug: projectState.activeProjectSlug, nodeId });
    },
    [projectState.activeProjectSlug, sessionDispatch],
  );

  const compact = useCallback(async () => {
    if (!projectState.activeProjectSlug || !activeSession.conversationId) return;
    const projectSlug = projectState.activeProjectSlug;
    const conversationId = activeSession.conversationId;
    sessionDispatch({ type: "STREAM_START", projectSlug, conversationId });
    try {
      const result = await apiCompact(projectSlug, conversationId);
      const activePath = result.nodes.map((n) => n.id);
      conversationDispatch({ type: "UPDATE", projectSlug, conversation: result.conversation });
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        projectSlug,
        conversationId: result.conversation.id,
        nodes: result.nodes,
        activePath,
      });
      void fetchConversations(projectSlug).then((conversations) =>
        conversationDispatch({ type: "SET_FOR_PROJECT", projectSlug, conversations }),
      );
      sessionDispatch({ type: "STREAM_RESET", projectSlug });
    } catch (err) {
      sessionDispatch({
        type: "STREAM_ERROR",
        projectSlug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [projectState.activeProjectSlug, activeSession.conversationId, sessionDispatch, conversationDispatch]);

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
