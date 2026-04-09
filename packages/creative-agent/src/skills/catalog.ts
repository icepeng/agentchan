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
 * clause. Moving the catalog into the same user-role channel as the seeded
 * `<skill_content>` blocks lets the model see both as one stream.
 *
 * Every visible skill is listed as a flat name+description bullet. The model
 * relies on the presence (or absence) of a `<skill_content name="...">` block
 * elsewhere in the conversation to know which skills are already loaded —
 * the activate_skill tool description carries the rule that owns that
 * inference. `disableModelInvocation` skills are hidden here; they reach the
 * model only via slash commands.
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
