import { useSWRConfig } from "swr";
import {
  useProjects,
  useProjectMutations,
} from "./useProjects.js";
import { closeProjectStream } from "@/client/session/index.js";
import { useView } from "@/client/shell/index.js";
import { json, qk } from "@/client/platform/index.js";
import { localStore } from "@/client/platform/index.js";
import type { AgentchanSessionInfo } from "@agentchan/creative-agent/browser";

/** Remembered session wins if still in the list; otherwise fall back to the default creative. */
function resolveSessionToOpen(
  sessions: AgentchanSessionInfo[],
  rememberedSessionId: string | null,
): string | null {
  if (rememberedSessionId && sessions.some((s) => s.id === rememberedSessionId)) {
    return rememberedSessionId;
  }
  return pickDefaultCreativeSessionId(sessions);
}

function fetchSessions(projectSlug: string): Promise<AgentchanSessionInfo[]> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/sessions`);
}

function fetchSession(projectSlug: string, id: string): Promise<unknown> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/sessions/${encodeURIComponent(id)}`);
}

function pickDefaultCreativeSessionId(
  sessions: ReadonlyArray<AgentchanSessionInfo>,
): string | null {
  return sessions.find((session) => session.mode === "creative")?.id ?? null;
}

export function useProject() {
  const view = useView();
  const { mutate } = useSWRConfig();

  const { data: projects = [] } = useProjects();
  const {
    create: createProjectMutation,
    update: updateProjectMutation,
    remove: deleteProjectMutation,
    duplicate: duplicateProjectMutation,
  } = useProjectMutations();

  const activeProjectSlug = view.activeProjectSlug;

  const fetchSessionsFor = async (slug: string): Promise<AgentchanSessionInfo[]> => {
    // Pass the fetch promise as the data argument so SWR's mutate awaits it
    // and populates the cache regardless of subscriber state. `mutate(key)`
    // alone routes through `startRevalidate`, which only invokes the fetcher
    // when there's a mounted `useSWR(key)` — so for a slug that's never been
    // subscribed (e.g. cross-project switch before SessionTabs remounts) it
    // would silently return cached `undefined`.
    const sessions = await mutate(qk.sessions(slug), fetchSessions(slug));
    return sessions ?? [];
  };

  const openProject = (slug: string, session?: string | null) => {
    view.dispatch({ type: "OPEN_PROJECT", slug, session });
  };

  const selectProject = async (slug: string) => {
    if (activeProjectSlug === slug) return;

    localStore.lastProject.write(slug);
    const rememberedSessionId = view.getRememberedSession(slug);

    // Sessions list + remembered detail fetch in parallel. The detail fetch
    // is speculative (we don't yet know the remembered id is valid); if the
    // session was 404'd server-side, the rejected promise leaves the cache
    // untouched and `resolveSessionToOpen`'s id validation drops us to the
    // default creative below.
    const [sessions] = await Promise.all([
      fetchSessionsFor(slug),
      rememberedSessionId
        ? mutate(
            qk.session(slug, rememberedSessionId),
            fetchSession(slug, rememberedSessionId),
          )
        : Promise.resolve(null),
    ]);

    openProject(slug, resolveSessionToOpen(sessions, rememberedSessionId));
  };

  const createProject = async (name: string, fromTemplate?: string) => {
    const project = await createProjectMutation(name, fromTemplate);
    openProject(project.slug, null);
    return project;
  };

  const duplicateProject = async (sourceSlug: string, name: string) => {
    const project = await duplicateProjectMutation(sourceSlug, name);
    openProject(project.slug, null);
    await fetchSessionsFor(project.slug);
    return project;
  };

  const renameProject = async (slug: string, name: string) => {
    return updateProjectMutation(slug, { name });
  };

  const deleteProject = async (slug: string) => {
    // Abort any in-flight stream so pi-agent-core cancels the LLM request and
    // settle the stream state before the project disappears from the UI.
    await closeProjectStream(slug);

    await deleteProjectMutation(slug);

    if (activeProjectSlug === slug) {
      const fallback = projects.find((p) => p.slug !== slug);
      if (fallback) {
        localStore.lastProject.write(fallback.slug);
        const rememberedSessionId = view.getRememberedSession(fallback.slug);
        const sessions = await fetchSessionsFor(fallback.slug);
        openProject(fallback.slug, resolveSessionToOpen(sessions, rememberedSessionId));
      }
      // No fallback: useRendererOutput's slug=null layout effect handles the
      // entity-state CLEAR (the presentation machine fades the layer out).
    }
    // Always drop the deleted slug's session memory.
    view.dispatch({ type: "FORGET_PROJECT", slug });
  };

  const loadProjects = async () => {
    const next = await mutate(qk.projects());
    return next ?? projects;
  };

  return {
    loadProjects,
    selectProject,
    createProject,
    duplicateProject,
    renameProject,
    deleteProject,
    activeProjectSlug,
    projects,
  };
}
