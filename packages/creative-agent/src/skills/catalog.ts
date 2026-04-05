import type { SkillRecord } from "./types.js";

/**
 * Generate a tier 1 skill catalog string for injection into the system prompt.
 */
export function generateCatalog(skills: SkillRecord[]): string {
  if (skills.length === 0) return "";

  const lines = skills.map(
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
