import { relative } from "node:path";
import type { SkillRecord } from "./types.js";

/**
 * Build a `<skill_content>` block ready to be injected as a user message.
 *
 * This is the single source of truth for the skill payload format. Three
 * call sites use it: SkillManager.execute (model-invoked activate_skill),
 * agent.service slash expansion + always-active auto-invoke, and the
 * compact re-injection step. Keeping the format in one place guarantees the
 * LLM payload is identical regardless of how the skill was triggered.
 *
 * Optional `args` are appended after the closing tag as plain text — used
 * by slash invocation to forward user-supplied arguments alongside the body.
 *
 * Lives in its own file (separate from isSkillContentBlock) because of the
 * `node:path` dependency: client hosts must be able to import the detect
 * predicate without pulling this builder into their bundle graph.
 */
export function buildSkillContent(
  skill: SkillRecord,
  projectDir: string,
  args = "",
): string {
  const skillDir = relative(projectDir, skill.baseDir);
  let content = `<skill_content name="${skill.meta.name}">\n`;
  content += skill.body + "\n\n";
  content += `Skill directory: ${skillDir}\n`;
  content += `Resource paths are relative to the skill directory. Prefix with the skill directory path when using file tools (e.g., read("${skillDir}/path/to/file")).\n`;
  content += `</skill_content>`;
  if (args) {
    content += `\n\n${args}`;
  }
  return content;
}
