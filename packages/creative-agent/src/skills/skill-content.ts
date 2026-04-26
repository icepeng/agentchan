import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * Wire-format prefix every `buildSkillContent` output begins with. Exported
 * so consumers can identify injected skill content without re-encoding the
 * wrapper tag.
 */
export const SKILL_CONTENT_PREFIX = "<skill_content";

export interface ParsedSkillContent {
  name: string;
  content: string;
  userMessage: string | undefined;
}

export function parseSkillContent(text: string): ParsedSkillContent | null {
  const match = text.match(/^<skill_content name="([^"]+)">\n([\s\S]*?)\n<\/skill_content>(?:\n\n([\s\S]+))?$/);
  if (!match) return null;
  return {
    name: match[1]!,
    content: match[2]!,
    userMessage: match[3]?.trim() || undefined,
  };
}

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
