import { useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import {
  useProjectState,
  useProjectDispatch,
  useProjects,
  useProjectMutations,
} from "@/client/entities/project/index.js";
import {
  useProjectRuntimeState,
  useProjectRuntimeDispatch,
  selectRuntime,
} from "@/client/entities/project-runtime/index.js";
import {
  abortProjectStream,
  type Session,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { localStore } from "@/client/shared/storage.js";

export function useProject() {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();
  const runtimeState = useProjectRuntimeState();
  const runtimeDispatch = useProjectRuntimeDispatch();
  const { mutate } = useSWRConfig();

  const { data: projects = [] } = useProjects();
  const {
    create: createProjectMutation,
    update: updateProjectMutation,
    remove: deleteProjectMutation,
    duplicate: duplicateProjectMutation,
  } = useProjectMutations();

  // Ref so selectProject doesn't re-create on every stream delta.
  const runtimeStateRef = useRef(runtimeState);
  useEffect(() => { runtimeStateRef.current = runtimeState; });

  const activateProject = useCallback(
    async (slug: string): Promise<Session[]> => {
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug });
      // Single GET: SWR's fetcher runs, result seeds the cache atomically.
      // Calling `fetchSessions` separately risked a duplicate fetch when
      // `useSessions(slug)` mounted outside the dedupe window.
      const sessions = await mutate<Session[]>(qk.sessions(slug));
      return sessions ?? [];
    },
    [projectDispatch, mutate],
  );

  const selectProject = useCallback(
    async (slug: string) => {
      // No-op if already active. Otherwise SET_ACTIVE_PROJECT would re-fire
      // and clear renderedHtml, but the slug-keyed useEffect in RenderedView
      // wouldn't re-run (primitive equality), leaving the renderer blank.
      if (projectState.activeProjectSlug === slug) return;

      localStore.lastProject.write(slug);
      const rememberedSessionId = selectRuntime(runtimeStateRef.current, slug).sessionId;

      // Sessions list + remembered detail fetch in parallel. The detail
      // fetch is speculative (we don't yet know the remembered id is valid);
      // if the session was deleted server-side, SWR's 404 leaves the
      // cache untouched and we skip the dispatch below.
      const [sessions] = await Promise.all([
        activateProject(slug),
        rememberedSessionId
          ? mutate(qk.session(slug, rememberedSessionId))
          : Promise.resolve(null),
      ]);

      if (rememberedSessionId && sessions.some((s) => s.id === rememberedSessionId)) {
        runtimeDispatch({
          type: "SET_ACTIVE_SESSION",
          projectSlug: slug,
          sessionId: rememberedSessionId,
        });
      }
    },
    [projectState.activeProjectSlug, activateProject, runtimeDispatch, mutate],
  );

  const createProject = useCallback(
    async (name: string, fromTemplate?: string) => {
      const project = await createProjectMutation(name, fromTemplate);
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug });
      return project;
    },
    [createProjectMutation, projectDispatch],
  );

  const duplicateProject = useCallback(
    async (sourceSlug: string, name: string) => {
      const project = await duplicateProjectMutation(sourceSlug, name);
      await activateProject(project.slug);
      return project;
    },
    [duplicateProjectMutation, activateProject],
  );

  const renameProject = useCallback(
    async (slug: string, name: string) => {
      return updateProjectMutation(slug, { name });
    },
    [updateProjectMutation],
  );

  const deleteProject = useCallback(
    async (slug: string) => {
      // Abort any in-flight stream so pi-agent-core cancels the LLM request
      // and drop the runtime slot so stale completion events can't resurrect it.
      abortProjectStream(slug);
      runtimeDispatch({ type: "CLOSE_RUNTIME", projectSlug: slug });

      await deleteProjectMutation(slug);

      if (projectState.activeProjectSlug === slug) {
        const fallback = projects.find((p) => p.slug !== slug);
        if (fallback) {
          localStore.lastProject.write(fallback.slug);
          await activateProject(fallback.slug);
        } else {
          projectDispatch({ type: "CLEAR_RENDER" });
        }
      }
    },
    [
      projectState.activeProjectSlug,
      projects,
      deleteProjectMutation,
      runtimeDispatch,
      projectDispatch,
      activateProject,
    ],
  );

  const loadProjects = useCallback(async () => {
    const next = await mutate(qk.projects());
    return next ?? projects;
  }, [mutate, projects]);

  return {
    loadProjects,
    selectProject,
    createProject,
    duplicateProject,
    renameProject,
    deleteProject,
    activeProjectSlug: projectState.activeProjectSlug,
    projects,
  };
}
