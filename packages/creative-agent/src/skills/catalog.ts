import type { SkillRecord } from "./types.js";

/**
 * Generate a tier 1 skill catalog string for injection into the system prompt.
 *
 * Filters out:
 * - alwaysActive skills: their body is already in context, listing them as
 *   activatable would be redundant.
 * - disableModelInvocation skills: hidden from the model on purpose; they
 *   stay reachable via slash command.
 */
export function generateCatalog(skills: SkillRecord[]): string {
  const visible = skills.filter(
    (s) => !s.meta.alwaysActive && !s.meta.disableModelInvocation,
  );
  if (visible.length === 0) return "";

  const lines = visible.map(
    (s) => `- ${s.meta.name}: ${s.meta.description}`,
  );

  return [
    "## Available Skills",
    "",
    "Use the `activate_skill` tool to load a skill's full instructions when the task matches its description.",
    "",
    ...lines,
  ].join("\n");
}
