import type { TextContent, UserMessage } from "@mariozechner/pi-ai";
import { buildSkillContent } from "../skills/skill-content.js";
import type { SkillRecord } from "../skills/types.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";

export function buildSkillInjectionContent(
  skills: SkillRecord[],
  projectDir: string,
): string {
  return skills.map((s) => buildSkillContent(s, projectDir)).join("\n\n");
}

export function buildUserMessageForPrompt(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): { message: UserMessage; llmText: string } {
  const slash = tryBuildSlashSkillMessage(rawText, projectDir, skills);
  if (slash) return slash;
  return {
    message: { role: "user", content: rawText, timestamp: Date.now() },
    llmText: rawText,
  };
}

function tryBuildSlashSkillMessage(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
): { message: UserMessage; llmText: string } | null {
  if (!rawText.trimStart().startsWith("/")) return null;
  const parsed = parseSlashInput(rawText);
  if (!parsed) return null;

  const skill = skills.get(parsed.name);
  if (!skill) return null;

  const skillText = buildSkillInjectionContent([skill], projectDir);
  const userText = serializeCommand(parsed.name, parsed.args);
  const content: TextContent[] = [
    { type: "text", text: skillText },
    { type: "text", text: userText },
  ];
  return {
    message: { role: "user", content, timestamp: Date.now() },
    llmText: `${skillText}\n${userText}`,
  };
}

export function textFromUserMessage(message: UserMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
