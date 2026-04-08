import type { SkillRecord } from "./types.js";

export interface ParsedSlashCommand {
  name: string;
  args: string;
}

/**
 * Parse a user message that begins with `/skillname [args...]`.
 * Returns null if the text does not match the slash command pattern.
 *
 * The skill name follows the same naming rules as SkillMetadata.name:
 * lowercase alphanumeric and hyphens, no leading/trailing hyphens.
 */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const match = text.match(/^\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? "").trim() };
}

/**
 * Look up a skill by name for slash invocation.
 * Returns null if the skill does not exist or is always-active.
 *
 * Always-active skills are excluded because they are auto-invoked at session
 * start — re-injecting via slash would just duplicate the body. Slash
 * auto-completion already hides them; this is a defense in depth check.
 *
 * Skills with `disableModelInvocation: true` ARE returned — slash is exactly
 * the channel they expect.
 */
export function findSlashInvocableSkill(
  skills: Map<string, SkillRecord>,
  name: string,
): SkillRecord | null {
  const skill = skills.get(name);
  if (!skill) return null;
  if (skill.meta.alwaysActive) return null;
  return skill;
}
