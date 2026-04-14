import { useCallback } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useSessionState,
  useSessionDispatch,
  createConversation as apiCreate,
  fetchConversation,
  deleteConversation as apiDelete,
  deleteNode as apiDeleteNode,
  switchBranch as apiSwitchBranch,
  fetchConversations,
  compactConversation as apiCompact,
} from "@/client/entities/session/index.js";

export function useConversation() {
  const projectState = useProjectState();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();

  const create = useCallback(async (mode?: "creative" | "meta") => {
    if (!projectState.activeProjectSlug) return;
    const { conversation, nodes } = await apiCreate(projectState.activeProjectSlug, mode);
    sessionDispatch({ type: "NEW_CONVERSATION", conversation, nodes });
    return conversation;
  }, [projectState.activeProjectSlug, sessionDispatch]);

  const load = useCallback(
    async (id: string) => {
      if (!projectState.activeProjectSlug) return;
      const data = await fetchConversation(projectState.activeProjectSlug, id);
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        conversation: data.conversation,
        nodes: data.nodes,
        activePath: data.activePath,
      });
    },
    [projectState.activeProjectSlug, sessionDispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!projectState.activeProjectSlug) return;
      await apiDelete(projectState.activeProjectSlug, id);
      sessionDispatch({ type: "DELETE_CONVERSATION", id });
    },
    [projectState.activeProjectSlug, sessionDispatch],
  );

  const refresh = useCallback(async () => {
    if (!projectState.activeProjectSlug) return;
    const conversations = await fetchConversations(projectState.activeProjectSlug);
    sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
  }, [projectState.activeProjectSlug, sessionDispatch]);

  const switchBranch = useCallback(
    async (nodeId: string) => {
      if (!sessionState.activeConversationId || !projectState.activeProjectSlug) return;
      const result = await apiSwitchBranch(projectState.activeProjectSlug, sessionState.activeConversationId, nodeId);
      sessionDispatch({ type: "SET_ACTIVE_PATH", activePath: result.activePath });
    },
    [sessionState.activeConversationId, projectState.activeProjectSlug, sessionDispatch],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!sessionState.activeConversationId || !projectState.activeProjectSlug) return;
      await apiDeleteNode(projectState.activeProjectSlug, sessionState.activeConversationId, nodeId);
      const data = await fetchConversation(projectState.activeProjectSlug, sessionState.activeConversationId);
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        conversation: data.conversation,
        nodes: data.nodes,
        activePath: data.activePath,
      });
    },
    [sessionState.activeConversationId, projectState.activeProjectSlug, sessionDispatch],
  );

  const setReplyTo = useCallback(
    (nodeId: string | null) => {
      sessionDispatch({ type: "SET_REPLY_TO", nodeId });
    },
    [sessionDispatch],
  );

  const compact = useCallback(async () => {
    if (!projectState.activeProjectSlug || !sessionState.activeConversationId) return;
    const projectSlug = projectState.activeProjectSlug;
    const conversationId = sessionState.activeConversationId;
    sessionDispatch({ type: "STREAM_START", projectSlug, conversationId });
    try {
      const result = await apiCompact(projectSlug, conversationId);
      const activePath = result.nodes.map((n) => n.id);
      sessionDispatch({
        type: "SET_ACTIVE_CONVERSATION",
        conversation: result.conversation,
        nodes: result.nodes,
        activePath,
      });
      void fetchConversations(projectSlug).then((conversations) =>
        sessionDispatch({ type: "SET_CONVERSATIONS", conversations }),
      );
      sessionDispatch({ type: "STREAM_RESET", projectSlug });
    } catch (err) {
      sessionDispatch({
        type: "STREAM_ERROR",
        projectSlug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [projectState.activeProjectSlug, sessionState.activeConversationId, sessionDispatch]);

  return {
    create,
    load,
    remove,
    refresh,
    switchBranch,
    setReplyTo,
    deleteNode,
    compact,
    activeConversationId: sessionState.activeConversationId,
  };
}
