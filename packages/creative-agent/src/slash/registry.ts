import type { SkillMetadata } from "../skills/types.js";
import type { SlashCommandInfo } from "./types.js";

/**
 * Enumerate every slash command the domain layer exposes for the given
 * project. Today this is just skills; new sources (tool, agent, mcp, ...)
 * plug in here as additional pushes — the function shape stays the same and
 * every host (webui autocomplete, future RPC `get_commands`) automatically
 * surfaces them.
 *
 * Always-active skills are excluded: their body is auto-injected at session
 * start, so a manual /name slash would just duplicate the body. The webui
 * client and server's findSlashInvocableSkill enforce the same rule — this
 * is the canonical filter, the others are defense in depth.
 *
 * Takes `Iterable<SkillMetadata>` so callers with either an array (client)
 * or a `Map<string, SkillRecord>` (server: `[...m.values()].map(s => s.meta)`)
 * can pass through without conversion friction.
 */
export function listSlashCommands(skills: Iterable<SkillMetadata>): SlashCommandInfo[] {
  const result: SlashCommandInfo[] = [];
  for (const skill of skills) {
    if (skill.alwaysActive) continue;
    result.push({
      name: skill.name,
      description: skill.description,
      source: "skill",
    });
  }
  return result;
}
