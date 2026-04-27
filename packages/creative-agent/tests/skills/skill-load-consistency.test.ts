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
import { buildAgentHistory } from "../../src/session/index.js";
import { createSessionStorage } from "../../src/session/index.js";
import type { DraftEntry } from "../../src/session/index.js";
import type { TextContent, UserMessage } from "@mariozechner/pi-ai";

// Two skill-injection paths must produce the same `<skill_content>` text:
// 1. Slash command → buildUserDraftEntries embeds the skill body in the
//    user message that is persisted and replayed every turn.
// 2. activate_skill tool → execute() returns the body in a tool result
//    that is persisted as part of the assistant turn and replayed every
//    turn.

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
  test("slash invocation emits a single user message that embeds the skill body", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserDraftEntries(
      "/invocable-character hello world",
      projectDir,
      skills,
    );

    expect(result.drafts).toHaveLength(1);
    const [draft] = result.drafts;
    expect(draft.type).toBe("message");

    const text = userMessageText(draft!);
    expect(text.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(text).toContain('name="invocable-character"');
    expect(text).toContain("</skill_content>");
    expect(text).toContain("<command-name>/invocable-character</command-name>");
    expect(text).toContain("<command-args>hello world</command-args>");

    expect(result.llmText).toBe(text);
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
    const slashText = userMessageText(slashResult.drafts[0]!);
    const closeIdx = slashText.lastIndexOf("</skill_content>") + "</skill_content>".length;
    const slashSkillText = slashText.slice(0, closeIdx);

    const tool = createActivateSkillTool(skills, projectDir);
    const toolResult = await tool.execute("test-call-id", { name: "invocable-character" });
    const activatedText = getToolResultText(toolResult);

    expect(slashSkillText).toBe(activatedText);
  });
});

describe("skill body persists in LLM history across turns", () => {
  test("buildAgentHistory replays the skill_content block on turn 2", async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), "skill-history-"));
    try {
      const slug = "history-test";
      await mkdir(join(projectsRoot, slug), { recursive: true });
      const projectSkillsDir = join(projectsRoot, slug, "skills");
      await mkdir(join(projectSkillsDir, "invocable-character"), { recursive: true });
      await writeFile(join(projectSkillsDir, "invocable-character", "SKILL.md"), INVOCABLE_SKILL);

      const storage = createSessionStorage(projectsRoot);
      const info = await storage.createSession(slug, {});
      const skills = await discoverProjectSkills(projectSkillsDir);

      const slashResult = buildUserDraftEntries(
        "/invocable-character hello",
        join(projectsRoot, slug),
        skills,
      );
      await storage.appendAtLeaf(slug, info.id, null, slashResult.drafts);

      const after = await storage.readSession(slug, info.id);
      if (!after) throw new Error("expected session to exist after append");
      const history = buildAgentHistory(after.entries, after.leafId);

      // The user message replayed on turn 2 must carry the skill body.
      const userMsg = history.find((m) => m.role === "user");
      expect(userMsg).toBeDefined();
      const userText =
        typeof userMsg!.content === "string"
          ? userMsg!.content
          : (userMsg!.content as { type: string; text?: string }[])
              .filter((b) => b.type === "text")
              .map((b) => b.text!)
              .join("\n");
      expect(userText).toContain(SKILL_CONTENT_PREFIX);
      expect(userText).toContain('name="invocable-character"');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
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
