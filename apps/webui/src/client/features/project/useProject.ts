import { useSWRConfig } from "swr";
import {
  useProjects,
  useProjectMutations,
} from "@/client/entities/project/index.js";
import {
  useAgentStateDispatch,
} from "@/client/entities/agent-state/index.js";
import {
  useRendererViewDispatch,
} from "@/client/entities/renderer/index.js";
import {
  abortProjectStream,
  pickDefaultCreativeSessionId,
  type AgentchanSessionInfo,
} from "@/client/entities/session/index.js";
import {
  useViewState,
  useViewDispatch,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { localStore } from "@/client/shared/storage.js";

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

export function useProject() {
  const view = useViewState();
  const viewDispatch = useViewDispatch();
  const agentDispatch = useAgentStateDispatch();
  const rendererViewDispatch = useRendererViewDispatch();
  const { mutate } = useSWRConfig();

  const { data: projects = [] } = useProjects();
  const {
    create: createProjectMutation,
    update: updateProjectMutation,
    remove: deleteProjectMutation,
    duplicate: duplicateProjectMutation,
  } = useProjectMutations();

  const activeProjectSlug = selectActiveProjectSlug(view);

  const fetchSessionsFor = async (slug: string): Promise<AgentchanSessionInfo[]> => {
    // Single GET: SWR's fetcher runs, result seeds the cache atomically.
    // Calling `fetchSessions` separately risked a duplicate fetch when
    // `useSessions(slug)` mounted outside the dedupe window.
    const sessions = await mutate<AgentchanSessionInfo[]>(qk.sessions(slug));
    return sessions ?? [];
  };

  const openProject = (slug: string, session?: string | null) => {
    viewDispatch({ type: "OPEN_PROJECT", slug, session });
    // Clears stale output/error state, while the mounted renderer stays visible
    // until RenderedView's host state machine completes fade-out.
    rendererViewDispatch({ type: "CLEAR_RENDERER" });
  };

  const selectProject = async (slug: string) => {
    // No-op if already active. Otherwise OPEN_PROJECT would re-fire and clear
    // the renderer, but the slug-keyed useEffect in RenderedView wouldn't
    // re-run (primitive equality), leaving the renderer blank.
    if (activeProjectSlug === slug) return;

    localStore.lastProject.write(slug);
    const rememberedSessionId = view.sessionMemory.get(slug) ?? null;

    // Sessions list + remembered detail fetch in parallel. The detail fetch
    // is speculative (we don't yet know the remembered id is valid); if the
    // session was deleted server-side, SWR's 404 leaves the cache untouched
    // and we'll fall through to no session below.
    const [sessions] = await Promise.all([
      fetchSessionsFor(slug),
      rememberedSessionId
        ? mutate(qk.session(slug, rememberedSessionId))
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
    // drop the stream slot so stale completion events can't resurrect it.
    abortProjectStream(slug);
    agentDispatch({ type: "CLOSE", projectSlug: slug });

    await deleteProjectMutation(slug);

    if (activeProjectSlug === slug) {
      const fallback = projects.find((p) => p.slug !== slug);
      if (fallback) {
        localStore.lastProject.write(fallback.slug);
        const rememberedSessionId = view.sessionMemory.get(fallback.slug) ?? null;
        const sessions = await fetchSessionsFor(fallback.slug);
        openProject(fallback.slug, resolveSessionToOpen(sessions, rememberedSessionId));
      } else {
        viewDispatch({ type: "FORGET_PROJECT", slug });
        rendererViewDispatch({ type: "CLEAR" });
        return;
      }
    }
    // Always drop the deleted slug's session memory.
    viewDispatch({ type: "FORGET_PROJECT", slug });
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
