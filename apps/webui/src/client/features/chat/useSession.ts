import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { useProjectState } from "@/client/entities/project/index.js";
import {
  useActiveRuntime,
  useProjectRuntimeDispatch,
} from "@/client/entities/project-runtime/index.js";
import { useSessionMutations } from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";

export function useSession() {
  const projectState = useProjectState();
  const runtime = useActiveRuntime();
  const runtimeDispatch = useProjectRuntimeDispatch();
  const slug = projectState.activeProjectSlug;
  const mutations = useSessionMutations(slug);
  const { mutate } = useSWRConfig();

  const create = useCallback(async (mode?: "creative" | "meta") => {
    if (!slug) return;
    const { session } = await mutations.create(mode);
    runtimeDispatch({
      type: "SET_ACTIVE_SESSION",
      projectSlug: slug,
      sessionId: session.id,
    });
    return session;
  }, [slug, mutations, runtimeDispatch]);

  const load = useCallback(
    (id: string) => {
      if (!slug) return;
      // Flip selection immediately; `useSessionData(slug, id)` auto-fetches
      // under the new key. Mirrors `useProject.selectProject`, which flips
      // `activeProjectSlug` before the sessions-list fetch resolves —
      // subscribers fall back to empty arrays for the single render gap.
      runtimeDispatch({
        type: "SET_ACTIVE_SESSION",
        projectSlug: slug,
        sessionId: id,
      });
    },
    [slug, runtimeDispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!slug) return;
      await mutations.remove(id);
      if (runtime.sessionId === id) {
        runtimeDispatch({
          type: "SET_ACTIVE_SESSION",
          projectSlug: slug,
          sessionId: null,
        });
      }
    },
    [slug, mutations, runtimeDispatch, runtime.sessionId],
  );

  const refresh = useCallback(async () => {
    if (!slug) return;
    await mutate(qk.sessions(slug));
  }, [slug, mutate]);

  const switchBranch = useCallback(
    async (nodeId: string) => {
      if (!runtime.sessionId || !slug) return;
      await mutations.switchBranch(runtime.sessionId, nodeId);
    },
    [runtime.sessionId, slug, mutations],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!runtime.sessionId || !slug) return;
      await mutations.removeNode(runtime.sessionId, nodeId);
    },
    [runtime.sessionId, slug, mutations],
  );

  const setReplyTo = useCallback(
    (nodeId: string | null) => {
      if (!slug) return;
      runtimeDispatch({ type: "SET_REPLY_TO", projectSlug: slug, nodeId });
    },
    [slug, runtimeDispatch],
  );

  const compact = useCallback(async () => {
    if (!slug || !runtime.sessionId) return;
    const sessionId = runtime.sessionId;
    // STREAM_START locks the input while compact runs server-side.
    runtimeDispatch({ type: "STREAM_START", projectSlug: slug, sessionId });
    try {
      const result = await mutations.compact(sessionId);
      runtimeDispatch({
        type: "SET_ACTIVE_SESSION",
        projectSlug: slug,
        sessionId: result.session.id,
      });
      runtimeDispatch({ type: "STREAM_RESET", projectSlug: slug });
    } catch (err) {
      runtimeDispatch({
        type: "STREAM_ERROR",
        projectSlug: slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [slug, runtime.sessionId, mutations, runtimeDispatch]);

  return {
    create,
    load,
    remove,
    refresh,
    switchBranch,
    setReplyTo,
    deleteNode,
    compact,
    activeSessionId: runtime.sessionId,
  };
}
