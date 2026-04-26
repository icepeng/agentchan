/**
 * Pure helpers that build user SessionEntries for skill-injection paths
 * (slash invocation, plain prompt, activate_skill).
 */

import { nanoid } from "nanoid";
import type { UserMessage, TextContent } from "@mariozechner/pi-ai";
import type {
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import { buildSkillContent } from "../skills/skill-content.js";
import type { SkillRecord } from "../skills/types.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";

type UserEntryDraft = Omit<SessionMessageEntry, "parentId">;

export interface UserEntriesForPrompt {
  entries: UserEntryDraft[];
  promptEntry: UserEntryDraft;
  llmText: string;
}

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
 * Build the user SessionEntry entries for a raw user prompt.
 *
 * Slash and plain prompts both return a single message entry.
 *
 * `llmText` is the text fed to `agent.prompt()`.
 */
export function buildUserEntriesForPrompt(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): UserEntriesForPrompt {
  const slashEntries = tryBuildSlashSkillEntries(rawText, projectDir, skills);
  if (slashEntries) return slashEntries;

  const now = Date.now();
  const promptEntry: UserEntryDraft = {
    type: "message",
    id: nanoid(12),
    timestamp: new Date(now).toISOString(),
    message: { role: "user", content: rawText, timestamp: now } as UserMessage,
  };
  return { entries: [promptEntry], promptEntry, llmText: rawText };
}

function tryBuildSlashSkillEntries(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): UserEntriesForPrompt | null {
  if (!rawText.trimStart().startsWith("/")) return null;
  const parsed = parseSlashInput(rawText);
  if (!parsed) return null;

  const skill = skills.get(parsed.name);
  if (!skill) return null;

  const skillText = buildSkillInjectionContent([skill], projectDir);
  const userText = serializeCommand(parsed.name, parsed.args);
  const now = Date.now();
  const promptEntry: UserEntryDraft = {
    type: "message",
    id: nanoid(12),
    timestamp: new Date(now).toISOString(),
    message: {
      role: "user",
      content: [
        { type: "text", text: skillText },
        { type: "text", text: userText },
      ],
      timestamp: now,
    } as UserMessage,
  };
  return {
    entries: [promptEntry],
    promptEntry,
    llmText: skillText + "\n" + userText,
  };
}

/** Extract user-visible text from a user message entry. */
export function joinUserEntryText(message: SessionMessageEntry["message"]): string {
  if (message.role !== "user") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
