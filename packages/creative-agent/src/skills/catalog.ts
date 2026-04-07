import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * Generate a tier 1 skill catalog string for injection into the system prompt.
 *
 * Skills with `alwaysActive` are excluded — their full body is already in the
 * system prompt via generatePersistentSkillsBlock, so listing them in the
 * catalog would be redundant.
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

/**
 * Generate a system-prompt block containing the full body of every always-active skill.
 *
 * These skills are loaded once at session start and remain in context for the
 * entire conversation — the model does not need to invoke them.
 */
export function generatePersistentSkillsBlock(
  skills: SkillRecord[],
  projectDir: string,
): string {
  const persistent = skills.filter((s) => s.meta.alwaysActive);
  if (persistent.length === 0) return "";

  const blocks = persistent.map((skill) => {
    const skillDir = relative(projectDir, skill.baseDir);
    let content = `<skill name="${skill.meta.name}" location="${skillDir}">\n`;
    content += skill.body + "\n";
    content += `Resource paths are relative to the skill directory. Prefix with "${skillDir}/" when using file tools.\n`;
    content += `</skill>`;
    return content;
  });

  return [
    "## Persistent Skills",
    "",
    "The following skills are always active in this conversation. Their instructions apply throughout — you do not need to invoke them.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
