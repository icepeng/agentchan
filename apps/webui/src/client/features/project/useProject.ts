import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import {
  useProjectSelectionState,
  useProjectSelectionDispatch,
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

  // Ref so selectProject doesn't re-create on every stream delta.
  const sessionSelectionRef = useRef(sessionSelectionState);
  useEffect(() => { sessionSelectionRef.current = sessionSelectionState; });

  const activateProject = async (slug: string): Promise<Session[]> => {
    projectSelectionDispatch({ type: "SET_ACTIVE_PROJECT", slug });
    // RenderedView keys its renderer reload on activeProjectSlug; stale HTML
    // can no longer leak across switches because the renderer instance owns
    // the DOM and gets torn down when the slug-keyed effect fires.
    const sessions = await mutate<Session[]>(qk.sessions(slug));
    return sessions ?? [];
  };

  const selectProject = async (slug: string) => {
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
  };

  const createProject = async (name: string, fromTemplate?: string) => {
    const project = await createProjectMutation(name, fromTemplate);
    projectSelectionDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug });
    return project;
  };

  const duplicateProject = async (sourceSlug: string, name: string) => {
    const project = await duplicateProjectMutation(sourceSlug, name);
    await activateProject(project.slug);
    return project;
  };

  const renameProject = async (slug: string, name: string) => {
    return updateProjectMutation(slug, { name });
  };

  const deleteProject = async (slug: string) => {
    // Abort any in-flight stream so pi-agent-core cancels the LLM request
    // and drop the stream+selection slots so stale completion events can't
    // resurrect them.
    abortProjectStream(slug);
    agentDispatch({ type: "CLOSE", projectSlug: slug });
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
    activeProjectSlug: projectSelection.activeProjectSlug,
    projects,
  };
}
