import { useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import {
  useProjectSelectionState,
  useProjectSelectionDispatch,
  useProjects,
  useProjectMutations,
} from "@/client/entities/project/index.js";
import {
  useStreamDispatch,
} from "@/client/entities/stream/index.js";
import {
  useRendererViewDispatch,
} from "@/client/entities/renderer/index.js";
import {
  useSessionSelectionState,
  useSessionSelectionDispatch,
  selectSessionSelection,
  abortProjectStream,
  type Session,
} from "@/client/entities/session/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { localStore } from "@/client/shared/storage.js";

export function useProject() {
  const projectSelection = useProjectSelectionState();
  const projectSelectionDispatch = useProjectSelectionDispatch();
  const sessionSelectionState = useSessionSelectionState();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const streamDispatch = useStreamDispatch();
  const rendererViewDispatch = useRendererViewDispatch();
  const { mutate } = useSWRConfig();

  const { data: projects = [] } = useProjects();
  const {
    create: createProjectMutation,
    update: updateProjectMutation,
    remove: deleteProjectMutation,
    duplicate: duplicateProjectMutation,
  } = useProjectMutations();

  // Ref so selectProject doesn't re-create on every stream delta.
  const sessionSelectionRef = useRef(sessionSelectionState);
  useEffect(() => { sessionSelectionRef.current = sessionSelectionState; });

  const activateProject = useCallback(
    async (slug: string): Promise<Session[]> => {
      projectSelectionDispatch({ type: "SET_ACTIVE_PROJECT", slug });
      // slug-change 시점에 html을 동기적으로 비워야 off-screen 전환(Templates/Settings
      // 체류 중 사이드바로 프로젝트 교체) 후 main 복귀 시 이전 프로젝트의 렌더러
      // 출력이 잠깐 비치는 회귀를 막을 수 있음. theme은 의도적으로 유지해 새 출력
      // 도착 전 기본 팔레트로 튀는 2단계 깜빡임을 회피.
      rendererViewDispatch({ type: "CLEAR_HTML" });
      // Single GET: SWR's fetcher runs, result seeds the cache atomically.
      // Calling `fetchSessions` separately risked a duplicate fetch when
      // `useSessions(slug)` mounted outside the dedupe window.
      const sessions = await mutate<Session[]>(qk.sessions(slug));
      return sessions ?? [];
    },
    [projectSelectionDispatch, rendererViewDispatch, mutate],
  );

  const selectProject = useCallback(
    async (slug: string) => {
      // No-op if already active. Otherwise SET_ACTIVE_PROJECT would re-fire
      // and clear renderedHtml, but the slug-keyed useEffect in RenderedView
      // wouldn't re-run (primitive equality), leaving the renderer blank.
      if (projectSelection.activeProjectSlug === slug) return;

      localStore.lastProject.write(slug);
      const rememberedSessionId = selectSessionSelection(
        sessionSelectionRef.current,
        slug,
      ).openSessionId;

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
        sessionSelectionDispatch({
          type: "SET_ACTIVE_SESSION",
          projectSlug: slug,
          sessionId: rememberedSessionId,
        });
      }
    },
    [projectSelection.activeProjectSlug, activateProject, sessionSelectionDispatch, mutate],
  );

  const createProject = useCallback(
    async (name: string, fromTemplate?: string) => {
      const project = await createProjectMutation(name, fromTemplate);
      projectSelectionDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug });
      // activateProject와 동일한 이유로 slug 변경과 동기적으로 html clear.
      rendererViewDispatch({ type: "CLEAR_HTML" });
      return project;
    },
    [createProjectMutation, projectSelectionDispatch, rendererViewDispatch],
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
      // and drop the stream+selection slots so stale completion events can't
      // resurrect them.
      abortProjectStream(slug);
      streamDispatch({ type: "CLOSE", projectSlug: slug });
      sessionSelectionDispatch({ type: "CLEAR", projectSlug: slug });

      await deleteProjectMutation(slug);

      if (projectSelection.activeProjectSlug === slug) {
        const fallback = projects.find((p) => p.slug !== slug);
        if (fallback) {
          localStore.lastProject.write(fallback.slug);
          await activateProject(fallback.slug);
        } else {
          projectSelectionDispatch({ type: "SET_ACTIVE_PROJECT", slug: null });
          rendererViewDispatch({ type: "CLEAR" });
        }
      }
    },
    [
      projectSelection.activeProjectSlug,
      projects,
      deleteProjectMutation,
      streamDispatch,
      sessionSelectionDispatch,
      projectSelectionDispatch,
      rendererViewDispatch,
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
    activeProjectSlug: projectSelection.activeProjectSlug,
    projects,
  };
}
