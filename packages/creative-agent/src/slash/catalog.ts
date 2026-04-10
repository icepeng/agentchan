import type { SkillRecord } from "../skills/types.js";

/**
 * Resolve a parsed slash name to a SkillRecord. Any skill in skills/ is
 * invocable via slash command (including `disableModelInvocation` ones).
 */
export function findSlashInvocableSkill(
  skills: Map<string, SkillRecord>,
  name: string,
): SkillRecord | undefined {
  return skills.get(name);
}
