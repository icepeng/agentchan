import useSWR from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import type { SkillMetadata } from "./skill.types.js";

/** Per-project skill catalog. Null slug → no fetch. */
export function useSkills(projectSlug: string | null) {
  return useSWR<SkillMetadata[]>(projectSlug ? qk.skills(projectSlug) : null);
}
