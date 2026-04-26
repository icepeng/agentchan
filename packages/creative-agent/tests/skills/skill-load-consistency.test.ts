import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildUserMessageForPrompt } from "../../src/agent/build.js";
import { discoverProjectSkills } from "../../src/skills/discovery.js";
import { SKILL_CONTENT_PREFIX } from "../../src/skills/skill-content.js";
import { generateCatalog } from "../../src/skills/catalog.js";
import {
  SYSTEM_REMINDER_OPEN,
  SYSTEM_REMINDER_CLOSE,
} from "../../src/skills/catalog.js";
import { createActivateSkillTool } from "../../src/skills/manager.js";
import type { UserMessage, TextContent } from "@mariozechner/pi-ai";

// Two skill-injection paths must produce identical `<skill_content>` text:
// 1. Slash command → buildUserMessageForPrompt creates a Pi user message
// 2. activate_skill tool → execute() returns body in tool result

const INVOCABLE_SKILL = `---
name: invocable-character
description: an invocable character
---

# Invocable Character

I am loaded on demand via slash or activate_skill.`;

const HIDDEN_SKILL = `---
name: hidden-skill
description: a hidden skill
disable-model-invocation: true
---

# Hidden Skill

I am only invocable via slash command.`;

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "skill-consistency-"));
  const skillsDir = join(projectDir, "skills");
  await mkdir(join(skillsDir, "invocable-character"), { recursive: true });
  await mkdir(join(skillsDir, "hidden-skill"), { recursive: true });
  await writeFile(join(skillsDir, "invocable-character", "SKILL.md"), INVOCABLE_SKILL);
  await writeFile(join(skillsDir, "hidden-skill", "SKILL.md"), HIDDEN_SKILL);
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function getContent(message: UserMessage): string | (TextContent | { type: string })[] {
  return message.content;
}

function getText(message: UserMessage): string {
  const content = getContent(message);
  if (typeof content === "string") return content;
  const block = content[0];
  if (block?.type !== "text") throw new Error("expected first content block to be text");
  return (block as TextContent).text;
}

function getToolResultText(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block?.type !== "text" || !block.text) throw new Error("expected text content in tool result");
  return block.text;
}

describe("skill-load shape — two injection paths", () => {
  test("slash invocation path: buildUserMessageForPrompt returns single merged message", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserMessageForPrompt(
      "/invocable-character hello world",
      projectDir,
      skills,
    );

    const { message } = result;

    expect(message.role).toBe("user");
    const content = getContent(message);
    expect(Array.isArray(content)).toBe(true);
    expect((content as any[]).length).toBe(2);

    // content[0] = skill body
    const skillText = getText(message);
    expect(skillText.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(skillText).toContain('name="invocable-character"');
    expect(skillText).toContain("</skill_content>");

    // content[1] = serialized command
    const contentArr = content as (TextContent | { type: string })[];
    const cmdBlock = contentArr[1];
    expect(cmdBlock.type).toBe("text");
    const cmdText = (cmdBlock as TextContent).text;
    expect(cmdText).toContain("<command-name>/invocable-character</command-name>");
    expect(cmdText).toContain("<command-args>hello world</command-args>");

    // llmText includes both skill body and command, matching the message sent
    // to the provider and the persisted Pi session entry.
    expect(result.llmText).toContain(SKILL_CONTENT_PREFIX);
    expect(result.llmText).toContain('name="invocable-character"');
    expect(result.llmText).toContain("<command-name>/invocable-character</command-name>");
    expect(result.llmText).toContain("<command-args>hello world</command-args>");
  });

  test("activate_skill path: tool result contains skill body directly", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const tool = createActivateSkillTool(skills, projectDir);

    const result = await tool.execute("test-call-id", { name: "invocable-character" });
    const text = getToolResultText(result);
    expect(text.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(text).toContain('name="invocable-character"');
    expect(text).toContain("</skill_content>");
  });
});

describe("skill-load wire format consistency across paths", () => {
  test("slash and activate_skill produce byte-identical skill body text", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const slashResult = buildUserMessageForPrompt(
      "/invocable-character",
      projectDir,
      skills,
    );
    // content[0] is the skill body in the merged user message
    const slashSkillText = getText(slashResult.message);

    const tool = createActivateSkillTool(skills, projectDir);
    const toolResult = await tool.execute("test-call-id", { name: "invocable-character" });
    const activatedText = getToolResultText(toolResult);

    expect(slashSkillText).toBe(activatedText);
  });
});

describe("skill catalog generation", () => {
  test("generateCatalog produces <system-reminder> wrapped text", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const text = generateCatalog([...skills.values()]);
    expect(text).not.toBeNull();
    expect(text!.startsWith(SYSTEM_REMINDER_OPEN)).toBe(true);
    expect(text!.trimEnd().endsWith(SYSTEM_REMINDER_CLOSE)).toBe(true);
    // Only visible skills appear (hidden-skill has disableModelInvocation)
    expect(text).toMatch(/- invocable-character:/);
    expect(text).not.toMatch(/- hidden-skill:/);
  });

  test("returns null when no skills are visible to the model", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "skill-empty-"));
    try {
      await mkdir(join(emptyDir, "skills"), { recursive: true });
      const skills = await discoverProjectSkills(join(emptyDir, "skills"));
      const text = generateCatalog([...skills.values()]);
      expect(text).toBeNull();
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("slash invocation negative cases", () => {
  test("non-slash text → single regular user node, no skill chip", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserMessageForPrompt("just a regular message", projectDir, skills);
    expect(result.message.role).toBe("user");
    expect(getText(result.message)).toBe("just a regular message");
    expect(result.llmText).toBe("just a regular message");
  });

  test("unknown slash name → single regular user node (slash text falls through)", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserMessageForPrompt("/no-such-skill arg", projectDir, skills);
    expect(result.message.role).toBe("user");
    expect(getText(result.message)).toBe("/no-such-skill arg");
  });
});
