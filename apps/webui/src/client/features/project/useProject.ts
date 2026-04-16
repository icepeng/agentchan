import { useCallback } from "react";
import { flushSync } from "react-dom";
import {
  useProjectState,
  useProjectDispatch,
  fetchProjects as apiFetchProjects,
  createProject as apiCreate,
  updateProject as apiUpdate,
  deleteProject as apiDelete,
  duplicateProject as apiDuplicate,
} from "@/client/entities/project/index.js";
import {
  useSessionState,
  useSessionDispatch,
  fetchConversations,
  fetchConversation,
  abortProjectStream,
} from "@/client/entities/session/index.js";
import { useSkillDispatch, fetchSkills } from "@/client/entities/skill/index.js";
import { localStore } from "@/client/shared/storage.js";
import { withViewTransition } from "@/client/shared/viewTransition.js";
import { loadRenderOutput } from "./useOutput.js";

export function useProject() {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();
  const skillDispatch = useSkillDispatch();

  const loadProjects = useCallback(async () => {
    const projects = await apiFetchProjects();
    projectDispatch({ type: "SET_PROJECTS", projects });
    return projects;
  }, [projectDispatch]);

  const selectProject = useCallback(
    async (slug: string) => {
      // No-op if already active. Otherwise SET_ACTIVE_PROJECT would re-fire
      // and clear renderedHtml, but the slug-keyed useEffect in RenderedView
      // wouldn't re-run (primitive equality), leaving the renderer blank.
      if (projectState.activeProjectSlug === slug) return;

      localStore.lastProject.write(slug);
      const rememberedSessionId = projectState.projectActiveSession.get(slug);
      const currentConversationId = sessionState.activeConversationId;

      // 모든 fetch를 VT 바깥에서 병렬 시작 — 렌더러 로드가 VT1 진행 중에 완료되면
      // VT2가 대기 없이 이어 시작되어 체감 지연이 최소화된다.
      const conversationsPromise = fetchConversations(slug);
      const skillsPromise = fetchSkills(slug);
      const outputPromise = loadRenderOutput(slug);

      // VT1: chrome swap (slug/sidebar/empty html). sync callback이라 VT overlay가
      // 덮이는 시간은 ~16ms → 클릭 즉시 crossfade가 시작돼 "멈춘 느낌" 사라진다.
      await withViewTransition(() => {
        flushSync(() => {
          projectDispatch({ type: "SET_ACTIVE_PROJECT", slug, currentConversationId });
          // SWITCH_PROJECT replaces the active view but preserves streams Map so
          // background streams on other projects keep running and can notify on completion.
          sessionDispatch({ type: "SWITCH_PROJECT", projectSlug: slug, conversations: [] });
          skillDispatch({ type: "CLEAR" });
        });
      });

      // VT2: renderer 도착 시 theme+html 교체. output이 VT1 중에 이미 준비됐다면
      // 즉시 시작, 아니면 여기서 잠시 대기.
      const output = await outputPromise;
      await withViewTransition(() => {
        flushSync(() => {
          projectDispatch({ type: "SET_RENDER_OUTPUT", html: output.html, theme: output.theme });
        });
      });

      const [conversations, skills] = await Promise.all([conversationsPromise, skillsPromise]);
      sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
      skillDispatch({ type: "SET_SKILLS", skills });
      // Restore the previously active session if it still exists
      if (rememberedSessionId && conversations.some((c: { id: string }) => c.id === rememberedSessionId)) {
        const data = await fetchConversation(slug, rememberedSessionId);
        sessionDispatch({
          type: "SET_ACTIVE_CONVERSATION",
          conversation: data.conversation,
          nodes: data.nodes,
          activePath: data.activePath,
        });
      }
    },
    [projectState.activeProjectSlug, projectState.projectActiveSession, sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  const createProject = useCallback(
    async (name: string, fromTemplate?: string) => {
      const project = await apiCreate(name, fromTemplate);
      projectDispatch({ type: "ADD_PROJECT", project });
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug, currentConversationId: sessionState.activeConversationId });
      sessionDispatch({ type: "SWITCH_PROJECT", projectSlug: project.slug, conversations: [] });
      skillDispatch({ type: "CLEAR" });
      if (fromTemplate) {
        const skills = await fetchSkills(project.slug);
        skillDispatch({ type: "SET_SKILLS", skills });
      }
      return project;
    },
    [sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  const duplicateProject = useCallback(
    async (sourceSlug: string, name: string) => {
      const project = await apiDuplicate(sourceSlug, name);
      projectDispatch({ type: "ADD_PROJECT", project });
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug, currentConversationId: sessionState.activeConversationId });
      sessionDispatch({ type: "SWITCH_PROJECT", projectSlug: project.slug, conversations: [] });
      skillDispatch({ type: "CLEAR" });
      const [conversations, skills] = await Promise.all([
        fetchConversations(project.slug),
        fetchSkills(project.slug),
      ]);
      sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
      skillDispatch({ type: "SET_SKILLS", skills });
      return project;
    },
    [sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  const renameProject = useCallback(
    async (slug: string, name: string) => {
      const updated = await apiUpdate(slug, { name });
      projectDispatch({ type: "UPDATE_PROJECT", oldSlug: slug, project: updated });
      return updated;
    },
    [projectDispatch],
  );

  const deleteProject = useCallback(
    async (slug: string) => {
      // If a stream is in flight for this project, abort it before deletion so
      // pi-agent-core can cancel the LLM request and we don't keep billing.
      // Also drop the stream slot so stale completion events can't resurrect state.
      abortProjectStream(slug);
      sessionDispatch({ type: "REMOVE_STREAM", projectSlug: slug });

      await apiDelete(slug);
      projectDispatch({ type: "DELETE_PROJECT", slug });
      if (projectState.activeProjectSlug === slug) {
        const fallback = projectState.projects.find((p) => p.slug !== slug);
        if (fallback) {
          localStore.lastProject.write(fallback.slug);
          projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: fallback.slug, currentConversationId: sessionState.activeConversationId });
          sessionDispatch({ type: "SWITCH_PROJECT", projectSlug: fallback.slug, conversations: [] });
          skillDispatch({ type: "CLEAR" });
          const [conversations, skills] = await Promise.all([
            fetchConversations(fallback.slug),
            fetchSkills(fallback.slug),
          ]);
          sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
          skillDispatch({ type: "SET_SKILLS", skills });
        } else {
          // No remaining projects — clear the view.
          sessionDispatch({ type: "SWITCH_PROJECT", projectSlug: null, conversations: [] });
        }
      }
    },
    [projectState.activeProjectSlug, projectState.projects, sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  return {
    loadProjects,
    selectProject,
    createProject,
    duplicateProject,
    renameProject,
    deleteProject,
    activeProjectSlug: projectState.activeProjectSlug,
    projects: projectState.projects,
  };
}
