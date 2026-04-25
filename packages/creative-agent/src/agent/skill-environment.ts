import { join } from "node:path";

import { discoverProjectSkills } from "../skills/discovery.js";
import type { SkillEnvironment, SkillMetadata, SkillRecord } from "../skills/types.js";
import type { SessionMode } from "../session/format.js";

export function getSessionSkillEnvironment(sessionMode?: SessionMode): SkillEnvironment {
  return sessionMode === "meta" ? "meta" : "creative";
}

export function filterSkillsByEnvironment(
  skills: Map<string, SkillRecord>,
  env: SkillEnvironment,
): Map<string, SkillRecord> {
  const filtered = new Map<string, SkillRecord>();
  for (const [name, skill] of skills) {
    if ((skill.meta.environment ?? "creative") === env) {
      filtered.set(name, skill);
    }
  }
  return filtered;
}

export async function loadEnvironmentSkills(
  projectDir: string,
  env: SkillEnvironment,
): Promise<Map<string, SkillRecord>> {
  const allSkills = await discoverProjectSkills(join(projectDir, "skills"));
  return filterSkillsByEnvironment(allSkills, env);
}

export async function getProjectSkillMetadata(projectDir: string): Promise<SkillMetadata[]> {
  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  return [...skills.values()].map((s) => s.meta);
}
