import { join } from "node:path";
import { getSkills } from "@agentchan/creative-agent";
import type { ProjectSkillRepo } from "../repositories/project-skill.repo.js";

export function createSkillService(
  projectSkillRepo: ProjectSkillRepo,
  projectsDir: string,
) {
  return {
    async listProjectSkills(slug: string) {
      return getSkills(join(projectsDir, slug));
    },

    async getProjectSkill(slug: string, name: string) {
      return projectSkillRepo.get(slug, name);
    },

    async createProjectSkill(slug: string, name: string, content: string) {
      return projectSkillRepo.create(slug, name, content);
    },

    async updateProjectSkill(slug: string, name: string, content: string) {
      return projectSkillRepo.update(slug, name, content);
    },

    async deleteProjectSkill(slug: string, name: string) {
      return projectSkillRepo.delete(slug, name);
    },
  };
}

export type SkillService = ReturnType<typeof createSkillService>;
