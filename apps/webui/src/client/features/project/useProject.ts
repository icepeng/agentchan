import { useCallback, useEffect, useRef } from "react";
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
  selectSession,
  fetchConversations,
  fetchConversation,
  abortProjectStream,
  type Conversation,
} from "@/client/entities/session/index.js";
import { useConversationDispatch } from "@/client/entities/conversation/index.js";
import { useSkillDispatch, fetchSkills } from "@/client/entities/skill/index.js";
import { localStore } from "@/client/shared/storage.js";

export function useProject() {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();
  const sessionState = useSessionState();
  const sessionDispatch = useSessionDispatch();
  const conversationDispatch = useConversationDispatch();
  const skillDispatch = useSkillDispatch();

  // Ref so selectProject doesn't re-create on every stream delta.
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; });

  const loadProjects = useCallback(async () => {
    const projects = await apiFetchProjects();
    projectDispatch({ type: "SET_PROJECTS", projects });
    return projects;
  }, [projectDispatch]);

  const activateProject = useCallback(
    async (slug: string): Promise<Conversation[]> => {
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug });
      skillDispatch({ type: "CLEAR" });
      const [conversations, skills] = await Promise.all([
        fetchConversations(slug),
        fetchSkills(slug),
      ]);
      conversationDispatch({ type: "SET_FOR_PROJECT", projectSlug: slug, conversations });
      skillDispatch({ type: "SET_SKILLS", skills });
      return conversations;
    },
    [projectDispatch, conversationDispatch, skillDispatch],
  );

  const selectProject = useCallback(
    async (slug: string) => {
      // No-op if already active. Otherwise SET_ACTIVE_PROJECT would re-fire
      // and clear renderedHtml, but the slug-keyed useEffect in RenderedView
      // wouldn't re-run (primitive equality), leaving the renderer blank.
      if (projectState.activeProjectSlug === slug) return;

      localStore.lastProject.write(slug);
      const rememberedSessionId = selectSession(sessionStateRef.current, slug).conversationId;
      const conversations = await activateProject(slug);
      // Re-fetch even if remembered — server may have persisted assistant
      // nodes from a background stream that we haven't seen yet.
      if (rememberedSessionId && conversations.some((c) => c.id === rememberedSessionId)) {
        const data = await fetchConversation(slug, rememberedSessionId);
        conversationDispatch({ type: "UPDATE", projectSlug: slug, conversation: data.conversation });
        sessionDispatch({
          type: "SET_ACTIVE_CONVERSATION",
          projectSlug: slug,
          conversationId: data.conversation.id,
          nodes: data.nodes,
          activePath: data.activePath,
        });
      }
    },
    [projectState.activeProjectSlug, activateProject, sessionDispatch, conversationDispatch],
  );

  const createProject = useCallback(
    async (name: string, fromTemplate?: string) => {
      const project = await apiCreate(name, fromTemplate);
      projectDispatch({ type: "ADD_PROJECT", project });
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug });
      skillDispatch({ type: "CLEAR" });
      if (fromTemplate) {
        const skills = await fetchSkills(project.slug);
        skillDispatch({ type: "SET_SKILLS", skills });
      }
      return project;
    },
    [projectDispatch, skillDispatch],
  );

  const duplicateProject = useCallback(
    async (sourceSlug: string, name: string) => {
      const project = await apiDuplicate(sourceSlug, name);
      projectDispatch({ type: "ADD_PROJECT", project });
      await activateProject(project.slug);
      return project;
    },
    [projectDispatch, activateProject],
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
      // Abort any in-flight stream so pi-agent-core cancels the LLM request
      // and drop the session slot so stale completion events can't resurrect it.
      abortProjectStream(slug);
      sessionDispatch({ type: "CLOSE_SESSION", projectSlug: slug });

      await apiDelete(slug);
      projectDispatch({ type: "DELETE_PROJECT", slug });
      conversationDispatch({ type: "REMOVE_PROJECT", projectSlug: slug });
      if (projectState.activeProjectSlug === slug) {
        const fallback = projectState.projects.find((p) => p.slug !== slug);
        if (fallback) {
          localStore.lastProject.write(fallback.slug);
          await activateProject(fallback.slug);
        }
        // No remaining projects — ProjectState.activeProjectSlug is already
        // null via DELETE_PROJECT, so selectors naturally return empty view.
      }
    },
    [projectState.activeProjectSlug, projectState.projects, projectDispatch, sessionDispatch, conversationDispatch, activateProject],
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
