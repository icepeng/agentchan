import type { SkillRecord } from "./types.js";

/**
 * Generate a tier 1 skill catalog string for injection into the system prompt.
 *
 * Skills with `alwaysActive` are excluded — their body is auto-invoked as the
 * first user message of the conversation (see agent.service.ts
 * maybeAutoInvokeAlwaysActive), so listing them in the catalog would be
 * redundant and would invite the model to call activate_skill on them.
 *
 * Skills with `disableModelInvocation` are also excluded — they are reachable
 * only via user slash invocation, never via the model's activate_skill tool.
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
