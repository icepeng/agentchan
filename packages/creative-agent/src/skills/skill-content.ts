import { relative } from "node:path";
import type { ContentBlock } from "../types.js";
import type { SkillRecord } from "./types.js";

/**
 * True if the given content block carries a `<skill_content>` payload.
 * Used by the chat UI to collapse the block into a short label and by
 * deriveConversation to skip it when picking a session title — both consumers
 * treat skill_content user nodes as system noise rather than user input.
 */
export function isSkillContentBlock(block: ContentBlock): boolean {
  return block.type === "text" && block.text.startsWith("<skill_content");
}

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
