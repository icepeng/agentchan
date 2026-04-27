import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildUserDraftEntries } from "../../src/agent/build.js";
import { discoverProjectSkills } from "../../src/skills/discovery.js";
import { SKILL_CONTENT_PREFIX } from "../../src/skills/skill-content.js";
import { generateCatalog } from "../../src/skills/catalog.js";
import {
  SYSTEM_REMINDER_OPEN,
  SYSTEM_REMINDER_CLOSE,
} from "../../src/skills/catalog.js";
import { createActivateSkillTool } from "../../src/skills/manager.js";
import { SKILL_LOAD_CUSTOM_TYPE } from "../../src/session/index.js";
import type { CustomMessageEntry, DraftEntry } from "../../src/session/index.js";
import type { TextContent, UserMessage } from "@mariozechner/pi-ai";

// Two skill-injection paths must produce identical `<skill_content>` text:
// 1. Slash command → buildUserDraftEntries emits a custom_message draft (skill-load) + user message
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

function customMessageContent(draft: DraftEntry): string {
  const ce = draft as CustomMessageEntry;
  if (typeof ce.content === "string") return ce.content;
  const block = ce.content[0];
  if (!block || block.type !== "text") throw new Error("expected text block");
  return (block as TextContent).text;
}

function userMessageText(draft: DraftEntry): string {
  const msg = (draft as { type: "message"; message: UserMessage }).message;
  if (typeof msg.content === "string") return msg.content;
  const first = msg.content[0];
  if (!first || first.type !== "text") throw new Error("expected text block");
  return (first as TextContent).text;
}

function getToolResultText(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block?.type !== "text" || !block.text) throw new Error("expected text content in tool result");
  return block.text;
}

describe("skill-load shape — slash injection", () => {
  test("slash invocation emits a custom_message + user message draft pair", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserDraftEntries(
      "/invocable-character hello world",
      projectDir,
      skills,
    );

    expect(result.drafts).toHaveLength(2);
    const [skillDraft, userDraft] = result.drafts;

    expect(skillDraft.type).toBe("custom_message");
    expect((skillDraft as CustomMessageEntry).customType).toBe(SKILL_LOAD_CUSTOM_TYPE);
    const skillText = customMessageContent(skillDraft);
    expect(skillText.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(skillText).toContain('name="invocable-character"');
    expect(skillText).toContain("</skill_content>");

    expect(userDraft.type).toBe("message");
    const userText = userMessageText(userDraft);
    expect(userText).toContain("<command-name>/invocable-character</command-name>");
    expect(userText).toContain("<command-args>hello world</command-args>");

    expect(result.llmText).toContain(SKILL_CONTENT_PREFIX);
    expect(result.llmText).toContain("<command-name>/invocable-character</command-name>");
  });
});

describe("skill-load wire format consistency across paths", () => {
  test("slash and activate_skill produce byte-identical skill body text", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const slashResult = buildUserDraftEntries(
      "/invocable-character",
      projectDir,
      skills,
    );
    const slashSkillText = customMessageContent(slashResult.drafts[0]!);

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
  test("non-slash text → single regular message draft, no skill injection", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserDraftEntries("just a regular message", projectDir, skills);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]!.type).toBe("message");
    expect(userMessageText(result.drafts[0]!)).toBe("just a regular message");
    expect(result.llmText).toBe("just a regular message");
  });

  test("unknown slash name → single regular message draft (slash text falls through)", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserDraftEntries("/no-such-skill arg", projectDir, skills);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]!.type).toBe("message");
    expect(userMessageText(result.drafts[0]!)).toBe("/no-such-skill arg");
  });
});
