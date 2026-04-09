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
 * Generate the skill catalog text that gets injected as a user-role
 * `<system-reminder>` message at conversation start (and after compact).
 *
 * Claude-Code-style channel unification: the catalog used to live in the
 * system prompt ("## Available Skills" section) while skill bodies were
 * seeded as user messages. That split let Gemini treat the catalog's positive
 * "Use activate_skill..." guidance as a BLOCKING trigger — in the ge project,
 * all three always-active skills fired `activate_skill` in parallel on the
 * very first user turn, ignoring the tool description's "already loaded"
 * clause. Moving the catalog into the conversation channel, wrapped in
 * `<system-reminder>`, puts both the catalog and the seeded bodies in the
 * same user-role channel where the "(already loaded)" marker survives.
 *
 * Every skill appears in the catalog (including always-active). Always-active
 * skills are tagged "(already loaded)" and accompanied by a forbidding clause
 * that names them inline. Non-always-active skills are callable through
 * `activate_skill` as normal. `disableModelInvocation` skills are always
 * hidden — they reach the model only via slash commands.
 *
 * Returns `null` if there is nothing to list (no skills, or all are
 * disableModelInvocation).
 */
export function generateCatalog(skills: SkillRecord[]): string | null {
  const visible = skills.filter((s) => !s.meta.disableModelInvocation);
  if (visible.length === 0) return null;

  const lines = visible.map((s) => {
    const suffix = s.meta.alwaysActive ? " (already loaded)" : "";
    return `- ${s.meta.name}${suffix}: ${s.meta.description}`;
  });

  return [
    SYSTEM_REMINDER_OPEN,
    "Available skills for this session:",
    "",
    ...lines,
    "",
    "Skills marked `(already loaded)` have their full instructions in `<skill_content>` blocks in this conversation — follow them directly. Do NOT call `activate_skill` on them; they are already active.",
    "",
    "For skills without that marker, call `activate_skill` with the skill name when the task matches the skill's description. Only names listed above are valid targets.",
    SYSTEM_REMINDER_CLOSE,
  ].join("\n");
}
