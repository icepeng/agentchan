/**
 * Pure helpers that build draft session entries for skill-injection paths
 * (slash invocation, plain prompt, activate_skill).
 *
 * Returns DraftEntry[] — storage assigns id/parentId/timestamp.
 */

import type { Message, TextContent, UserMessage } from "@mariozechner/pi-ai";
import type { DraftEntry } from "../session/index.js";
import { buildSkillContent } from "../skills/skill-content.js";
import type { SkillRecord } from "../skills/types.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";

/**
 * Format one or more skill bodies into the canonical injection text.
 * Single source of truth for the on-the-wire format used by every
 * skill-injection path.
 */
export function buildSkillInjectionContent(
  skills: SkillRecord[],
  projectDir: string,
): string {
  return skills.map((s) => buildSkillContent(s, projectDir)).join("\n\n");
}

/**
 * Build draft session entries for a raw user prompt.
 *
 * Slash → single user message whose content embeds the skill body followed
 *   by the command text. The same combined text is fed to `agent.prompt()`,
 *   so what we persist and what the LLM sees on this turn (and every later
 *   turn rebuilt from history) match 1:1.
 * Plain → single user message.
 */
export function buildUserDraftEntries(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): { drafts: DraftEntry[]; llmText: string } {
  const slash = tryBuildSlashSkillDrafts(rawText, projectDir, skills);
  if (slash) return slash;

  return { drafts: [makeUserMessageDraft(rawText)], llmText: rawText };
}

function tryBuildSlashSkillDrafts(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): { drafts: DraftEntry[]; llmText: string } | null {
  if (!rawText.trimStart().startsWith("/")) return null;
  const parsed = parseSlashInput(rawText);
  if (!parsed) return null;

  const skill = skills.get(parsed.name);
  if (!skill) return null;

  const skillText = buildSkillInjectionContent([skill], projectDir);
  const userText = serializeCommand(parsed.name, parsed.args);
  const combined = `${skillText}\n\n${userText}`;

  return {
    drafts: [makeUserMessageDraft(combined)],
    llmText: combined,
  };
}

function makeUserMessageDraft(text: string): DraftEntry {
  const message: UserMessage = {
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
  return {
    type: "message",
    message,
  };
}

/** Extract user-visible text from a user message's content. */
export function joinUserMessageText(message: Message): string {
  if (message.role !== "user") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
