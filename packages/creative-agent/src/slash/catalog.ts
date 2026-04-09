import type { SkillRecord } from "../skills/types.js";

/**
 * Resolve a parsed slash name to a SkillRecord. Any skill that is not
 * `alwaysActive` is invocable (including `disableModelInvocation`).
 */
export function findSlashInvocableSkill(
  skills: Map<string, SkillRecord>,
  name: string,
): SkillRecord | undefined {
  const skill = skills.get(name);
  if (!skill) return undefined;
  if (skill.meta.alwaysActive) return undefined;
  return skill;
}
