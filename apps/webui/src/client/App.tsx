import { useEffect } from "react";
import { useProjectDispatch, fetchProjects } from "@/client/entities/project/index.js";
import { fetchConversations } from "@/client/entities/session/index.js";
import { useConversationDispatch } from "@/client/entities/conversation/index.js";
import { useConfigDispatch, fetchConfig, fetchProviders } from "@/client/entities/config/index.js";
import { useSkillDispatch, fetchSkills } from "@/client/entities/skill/index.js";
import { localStore } from "@/client/shared/storage.js";

import { AppShell } from "@/client/app/index.js";

export function App() {
  const projectDispatch = useProjectDispatch();
  const conversationDispatch = useConversationDispatch();
  const configDispatch = useConfigDispatch();
  const skillDispatch = useSkillDispatch();

  useEffect(() => {
    void Promise.all([
      fetchProjects(),
      fetchConfig(),
      fetchProviders(),
    ]).then(async ([projects, config, providers]) => {
      projectDispatch({ type: "SET_PROJECTS", projects });
      configDispatch({
        type: "SET_CONFIG",
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        contextWindow: config.contextWindow,
        thinkingLevel: config.thinkingLevel,
      });
      configDispatch({ type: "SET_PROVIDERS", providers });

      const lastSlug = localStore.lastProject.read();
      const defaultProject = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0];
      if (defaultProject) {
        projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: defaultProject.slug });
        const [conversations, skills] = await Promise.all([
          fetchConversations(defaultProject.slug),
          fetchSkills(defaultProject.slug),
        ]);
        conversationDispatch({
          type: "SET_FOR_PROJECT",
          projectSlug: defaultProject.slug,
          conversations,
        });
        skillDispatch({ type: "SET_SKILLS", skills });
      }
    });
  }, [projectDispatch, conversationDispatch, configDispatch, skillDispatch]);

  return <AppShell />;
}
