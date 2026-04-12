import type { SkillRecord } from "./types.js";

/**
 * Claude-Code-style `<system-reminder>` wrapper tags. Exported so tests and
 * any future reminder-producing helper can reference the same literal instead
 * of re-encoding it — mirrors the `SKILL_CONTENT_PREFIX` convention in
 * `skill-content.ts`.
 */
export const SYSTEM_REMINDER_OPEN = "<system-reminder>";
export const SYSTEM_REMINDER_CLOSE = "</system-reminder>";

/**
 * Generate the skill catalog as a `<system-reminder>` block for inclusion
 * in the system prompt.
 *
 * Every visible skill is listed as a flat name+description bullet.
 * `disableModelInvocation` skills are hidden; they reach the model only
 * via slash commands.
 *
 * Returns `null` if there is nothing to list.
 */
export function generateCatalog(skills: SkillRecord[]): string | null {
  const visible = skills.filter((s) => !s.meta.disableModelInvocation);
  if (visible.length === 0) return null;

  const lines = visible.map(
    (s) => `- ${s.meta.name}: ${s.meta.description}`,
  );

  return [
    SYSTEM_REMINDER_OPEN,
    "The following skills are available for use with the activate_skill tool:",
    "",
    ...lines,
    SYSTEM_REMINDER_CLOSE,
  ].join("\n");
}
