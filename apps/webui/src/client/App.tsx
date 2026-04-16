import { useEffect } from "react";
import { useProjectDispatch, fetchProjects } from "@/client/entities/project/index.js";
import { useSessionDispatch, fetchConversations } from "@/client/entities/session/index.js";
import { useConfigDispatch, fetchConfig, fetchProviders } from "@/client/entities/config/index.js";
import { useSkillDispatch, fetchSkills } from "@/client/entities/skill/index.js";
import { loadRenderOutput } from "@/client/features/project/index.js";
import { localStore } from "@/client/shared/storage.js";

import { AppShell } from "@/client/app/index.js";

export function App() {
  const projectDispatch = useProjectDispatch();
  const sessionDispatch = useSessionDispatch();
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
        // Renderer도 여기서 함께 로드 — 없으면 RenderedView effect가 선점해서
        // selectProject 경로와 double-fetch가 될 수 있다.
        const [conversations, skills, output] = await Promise.all([
          fetchConversations(defaultProject.slug),
          fetchSkills(defaultProject.slug),
          loadRenderOutput(defaultProject.slug),
        ]);
        projectDispatch({ type: "SET_RENDER_OUTPUT", html: output.html, theme: output.theme });
        sessionDispatch({ type: "SET_CONVERSATIONS", conversations });
        skillDispatch({ type: "SET_SKILLS", skills });
      }
    });
  }, [projectDispatch, sessionDispatch, configDispatch, skillDispatch]);

  return <AppShell />;
}
