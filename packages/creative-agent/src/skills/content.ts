import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * Build the full skill content injected into the agent via steer.
 * Extracted from SkillManager so it can be reused for runtime substitution.
 */
export function buildSkillContent(name: string, skill: SkillRecord, projectDir: string): string {
  let content = `<skill_content name="${name}">\n`;

  if (skill.meta.compatibility) {
    content += `Compatibility: ${skill.meta.compatibility}\n\n`;
  }

  content += skill.body + "\n\n";
  const skillDir = relative(projectDir, skill.baseDir);
  content += `Skill directory: ${skillDir}\n`;
  content += `Resource paths are relative to the skill directory. Prefix with the skill directory path when using file tools (e.g., read("${skillDir}/path/to/file")).\n`;

  content += "</skill_content>";
  return content;
}

/** Compact reference stored in conversation JSONL instead of the full body. */
export function buildSkillReference(name: string): string {
  return `<skill_activated name="${name}" />`;
}

/** Extract skill name from a `<skill_activated …/>` reference. Returns null if not a match. */
export function extractSkillReferenceName(text: string): string | null {
  const m = text.match(/^<skill_activated\s+name="([^"]+)"\s*\/>\s*$/);
  return m ? m[1] : null;
}
