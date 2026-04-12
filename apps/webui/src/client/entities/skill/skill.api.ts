import { json } from "@/client/shared/api.js";
import type { SkillMetadata } from "./skill.types.js";

// --- Project Skills ---

export function fetchSkills(projectSlug: string): Promise<SkillMetadata[]> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills`);
}
