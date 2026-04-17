import useSWR, { useSWRConfig } from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import {
  createConversation as apiCreate,
  deleteConversation as apiDelete,
  deleteNode as apiDeleteNode,
  switchBranch as apiSwitchBranch,
  compactConversation as apiCompact,
} from "@/client/entities/session/session.api.js";
import type { Conversation, TreeNode } from "./conversation.types.js";

/** Server-shaped conversation detail returned by `/conversations/:id`. */
export interface ConversationData {
  conversation: Conversation;
  nodes: TreeNode[];
  activePath: string[];
}

export function useConversations(projectSlug: string | null) {
  return useSWR<Conversation[]>(projectSlug ? qk.conversations(projectSlug) : null);
}

export function useConversationData(projectSlug: string | null, conversationId: string | null) {
  return useSWR<ConversationData>(
    projectSlug && conversationId ? qk.conversation(projectSlug, conversationId) : null,
  );
}

/**
 * Conversation mutations scoped to one project. Each mutation invalidates
 * both the list (`conversations`) and the detail (`conversation`) when both
 * shapes change — e.g. compact creates a new conversation, deletes the old.
 */
export function useConversationMutations(projectSlug: string | null) {
  const { mutate } = useSWRConfig();

  const create = async (mode?: "creative" | "meta") => {
    if (!projectSlug) throw new Error("create: projectSlug required");
    const result = await apiCreate(projectSlug, mode);
    await mutate(qk.conversations(projectSlug));
    // Seed detail cache with empty tree — the fresh conversation has no nodes
    // yet. Skipping this leaves `nodes` undefined and any computeUsageFromNodes
    // consumer crashes on iteration.
    await mutate(
      qk.conversation(projectSlug, result.conversation.id),
      { conversation: result.conversation, nodes: [], activePath: [] } satisfies ConversationData,
      { revalidate: false },
    );
    return result;
  };

  const remove = async (id: string) => {
    if (!projectSlug) throw new Error("remove: projectSlug required");
    await apiDelete(projectSlug, id);
    await mutate(qk.conversations(projectSlug));
    await mutate(qk.conversation(projectSlug, id), undefined, { revalidate: false });
  };

  const removeNode = async (conversationId: string, nodeId: string) => {
    if (!projectSlug) throw new Error("removeNode: projectSlug required");
    await apiDeleteNode(projectSlug, conversationId, nodeId);
    await mutate(qk.conversation(projectSlug, conversationId));
    await mutate(qk.conversations(projectSlug));
  };

  const switchBranch = async (conversationId: string, nodeId: string) => {
    if (!projectSlug) throw new Error("switchBranch: projectSlug required");
    const res = await apiSwitchBranch(projectSlug, conversationId, nodeId);
    await mutate<ConversationData>(
      qk.conversation(projectSlug, conversationId),
      (cur) => cur && { ...cur, activePath: res.activePath },
      { revalidate: false },
    );
    return res;
  };

  const compact = async (conversationId: string) => {
    if (!projectSlug) throw new Error("compact: projectSlug required");
    const result = await apiCompact(projectSlug, conversationId);
    await mutate(qk.conversations(projectSlug));
    // Invariant: `compactConversation` (pi-mono/agent/lifecycle.ts) always
    // produces a linear [user, assistant] chain, so the node order is the
    // activePath. If compact ever grows branching, the server must return
    // `activePath` explicitly and this synthesis needs to go.
    await mutate(
      qk.conversation(projectSlug, result.conversation.id),
      {
        conversation: result.conversation,
        nodes: result.nodes,
        activePath: result.nodes.map((n) => n.id),
      } satisfies ConversationData,
      { revalidate: false },
    );
    return result;
  };

  return { create, remove, removeNode, switchBranch, compact };
}
