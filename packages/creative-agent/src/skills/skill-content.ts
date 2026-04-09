import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * `args` is appended after the closing tag (not inside) so the LLM sees the
 * skill body followed by the user's free-form argument as a continuation of
 * the same turn — matching how slash invocation feels conversationally.
 */
export function buildSkillContent(
  skill: SkillRecord,
  projectDir: string,
  args: string,
): string {
  let content = `<skill_content name="${skill.meta.name}">\n`;
  content += skill.body + "\n\n";
  const skillDir = relative(projectDir, skill.baseDir);
  content += `Skill directory: ${skillDir}\n`;
  content += `Resource paths are relative to the skill directory. Prefix with the skill directory path when using file tools (e.g., read("${skillDir}/path/to/file")).\n`;
  content += "</skill_content>";
  if (args.trim()) content += `\n\n${args.trim()}`;
  return content;
}
