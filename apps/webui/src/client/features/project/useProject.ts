import { useCallback } from "react";
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
} from "@/client/entities/session/index.js";
import { useSkillDispatch, fetchSkills } from "@/client/entities/skill/index.js";

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
      localStorage.setItem("agentchan-last-project", slug);
      const rememberedSessionId = projectState.projectActiveSession.get(slug);
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug, currentConversationId: sessionState.activeConversationId });
      sessionDispatch({ type: "CLEAR" });
      skillDispatch({ type: "CLEAR" });
      const [conversations, skills] = await Promise.all([
        fetchConversations(slug),
        fetchSkills(slug),
      ]);
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
    [projectState.projectActiveSession, sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  const createProject = useCallback(
    async (name: string) => {
      const project = await apiCreate(name);
      projectDispatch({ type: "ADD_PROJECT", project });
      // Select the new project
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug, currentConversationId: sessionState.activeConversationId });
      sessionDispatch({ type: "CLEAR" });
      skillDispatch({ type: "CLEAR" });
      return project;
    },
    [sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
  );

  const duplicateProject = useCallback(
    async (sourceSlug: string, name: string) => {
      const project = await apiDuplicate(sourceSlug, name);
      projectDispatch({ type: "ADD_PROJECT", project });
      projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: project.slug, currentConversationId: sessionState.activeConversationId });
      sessionDispatch({ type: "CLEAR" });
      skillDispatch({ type: "CLEAR" });
      const skills = await fetchSkills(project.slug);
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
      await apiDelete(slug);
      projectDispatch({ type: "DELETE_PROJECT", slug });
      if (projectState.activeProjectSlug === slug) {
        const projects = await apiFetchProjects();
        if (projects.length > 0) {
          const fallback = projects[0];
          localStorage.setItem("agentchan-last-project", fallback.slug);
          projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: fallback.slug, currentConversationId: sessionState.activeConversationId });
          sessionDispatch({ type: "CLEAR" });
          skillDispatch({ type: "CLEAR" });
          const [conversations, skills] = await Promise.all([
            fetchConversations(fallback.slug),
            fetchSkills(fallback.slug),
          ]);
          sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
          skillDispatch({ type: "SET_SKILLS", skills });
        }
      }
    },
    [projectState.activeProjectSlug, sessionState.activeConversationId, projectDispatch, sessionDispatch, skillDispatch],
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
