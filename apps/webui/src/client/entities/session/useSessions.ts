import useSWR, { useSWRConfig } from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import {
  createSession as apiCreate,
  deleteSession as apiDelete,
  deleteNode as apiDeleteNode,
  switchBranch as apiSwitchBranch,
  compactSession as apiCompact,
} from "./session.api.js";
import type { Session, TreeNode } from "./session.types.js";

/** Server-shaped session detail returned by `/sessions/:id`. */
export interface SessionData {
  session: Session;
  nodes: TreeNode[];
  activePath: string[];
}

export function useSessions(projectSlug: string | null) {
  return useSWR<Session[]>(projectSlug ? qk.sessions(projectSlug) : null);
}

export function useSessionData(projectSlug: string | null, sessionId: string | null) {
  return useSWR<SessionData>(
    projectSlug && sessionId ? qk.session(projectSlug, sessionId) : null,
  );
}

/**
 * Session mutations scoped to one project. Each mutation invalidates
 * both the list (`sessions`) and the detail (`session`) when both
 * shapes change — e.g. compact creates a new session, deletes the old.
 */
export function useSessionMutations(projectSlug: string | null) {
  const { mutate } = useSWRConfig();

  const create = async (mode?: "creative" | "meta") => {
    if (!projectSlug) throw new Error("create: projectSlug required");
    const result = await apiCreate(projectSlug, mode);
    await mutate(qk.sessions(projectSlug));
    // Seed detail cache with empty tree — the fresh session has no nodes
    // yet. Skipping this leaves `nodes` undefined and any computeUsageFromNodes
    // consumer crashes on iteration.
    await mutate(
      qk.session(projectSlug, result.session.id),
      { session: result.session, nodes: [], activePath: [] } satisfies SessionData,
      { revalidate: false },
    );
    return result;
  };

  const remove = async (id: string) => {
    if (!projectSlug) throw new Error("remove: projectSlug required");
    await apiDelete(projectSlug, id);
    await mutate(qk.sessions(projectSlug));
    await mutate(qk.session(projectSlug, id), undefined, { revalidate: false });
  };

  const removeNode = async (sessionId: string, nodeId: string) => {
    if (!projectSlug) throw new Error("removeNode: projectSlug required");
    await apiDeleteNode(projectSlug, sessionId, nodeId);
    await mutate(qk.session(projectSlug, sessionId));
    await mutate(qk.sessions(projectSlug));
  };

  const switchBranch = async (sessionId: string, nodeId: string) => {
    if (!projectSlug) throw new Error("switchBranch: projectSlug required");
    const res = await apiSwitchBranch(projectSlug, sessionId, nodeId);
    await mutate<SessionData>(
      qk.session(projectSlug, sessionId),
      (cur) => cur && { ...cur, activePath: res.activePath },
      { revalidate: false },
    );
    return res;
  };

  const compact = async (sessionId: string) => {
    if (!projectSlug) throw new Error("compact: projectSlug required");
    const result = await apiCompact(projectSlug, sessionId);
    await mutate(qk.sessions(projectSlug));
    // Invariant: `compactSession` (creative-agent/agent/lifecycle.ts) always
    // produces a linear [user, assistant] chain, so the node order is the
    // activePath. If compact ever grows branching, the server must return
    // `activePath` explicitly and this synthesis needs to go.
    await mutate(
      qk.session(projectSlug, result.session.id),
      {
        session: result.session,
        nodes: result.nodes,
        activePath: result.nodes.map((n) => n.id),
      } satisfies SessionData,
      { revalidate: false },
    );
    return result;
  };

  return { create, remove, removeNode, switchBranch, compact };
}
