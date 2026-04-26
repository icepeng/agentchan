import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * Wire-format prefix every `buildSkillContent` output begins with. Exported
 * so consumers can identify injected skill content without re-encoding the
 * wrapper tag.
 */
export const SKILL_CONTENT_PREFIX = "<skill_content";

export function buildSkillContent(
  skill: SkillRecord,
  projectDir: string,
): string {
  let content = `${SKILL_CONTENT_PREFIX} name="${skill.meta.name}">\n`;
  content += skill.body + "\n\n";
  const skillDir = relative(projectDir, skill.baseDir);
  content += `Skill directory: ${skillDir}\n`;
  content += `Resource paths are relative to the skill directory. Prefix with the skill directory path when using file tools (e.g., read("${skillDir}/path/to/file")).\n`;
  content += "</skill_content>";
  return content;
}
