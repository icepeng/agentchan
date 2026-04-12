import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildUserNodeForPrompt } from "../../src/agent/build.js";
import { discoverProjectSkills } from "../../src/skills/discovery.js";
import { SKILL_CONTENT_PREFIX } from "../../src/skills/skill-content.js";
import { generateCatalog } from "../../src/skills/catalog.js";
import {
  SYSTEM_REMINDER_OPEN,
  SYSTEM_REMINDER_CLOSE,
} from "../../src/skills/catalog.js";
import { createActivateSkillTool } from "../../src/skills/manager.js";
import type { TreeNode } from "../../src/types.js";

// Two skill-injection paths must produce identical `<skill_content>` text:
// 1. Slash command → buildUserNodeForPrompt creates a skill-load TreeNode
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

function getText(node: TreeNode): string {
  const block = node.content[0];
  if (block?.type !== "text") throw new Error("expected first content block to be text");
  return block.text;
}

function getToolResultText(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block?.type !== "text" || !block.text) throw new Error("expected text content in tool result");
  return block.text;
}

function assertSkillLoadShape(node: TreeNode, expectedSkillName: string): void {
  expect(node.role).toBe("user");
  expect(node.meta).toBe("skill-load");
  expect(node.content).toHaveLength(1);
  const text = getText(node);
  expect(text.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
  expect(text).toContain(`name="${expectedSkillName}"`);
  expect(text).toContain("</skill_content>");
}

describe("skill-load shape — two injection paths", () => {
  test("slash invocation path: buildUserNodeForPrompt returns single merged node", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserNodeForPrompt(
      "/invocable-character hello world",
      projectDir,
      skills,
      "leaf-id",
    );

    expect(result.nodes).toHaveLength(1);
    const [node] = result.nodes;

    expect(node.role).toBe("user");
    expect(node.meta).toBe("skill-load");
    expect(node.parentId).toBe("leaf-id");
    expect(node.content).toHaveLength(2);

    // content[0] = skill body
    const skillText = getText(node);
    expect(skillText.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(skillText).toContain('name="invocable-character"');
    expect(skillText).toContain("</skill_content>");

    // content[1] = serialized command
    const cmdBlock = node.content[1];
    expect(cmdBlock.type).toBe("text");
    const cmdText = (cmdBlock as { type: "text"; text: string }).text;
    expect(cmdText).toContain("<command-name>/invocable-character</command-name>");
    expect(cmdText).toContain("<command-args>hello world</command-args>");

    // llmText includes both skill body and command — consistent with
    // regenerate path (joinUserNodeText joins all content blocks).
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

    const slashResult = buildUserNodeForPrompt(
      "/invocable-character",
      projectDir,
      skills,
      null,
    );
    // content[0] is the skill body in the merged node
    const slashSkillText = getText(slashResult.nodes[0]);

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
    const result = buildUserNodeForPrompt("just a regular message", projectDir, skills, null);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].meta).toBeUndefined();
    expect(getText(result.nodes[0])).toBe("just a regular message");
    expect(result.llmText).toBe("just a regular message");
  });

  test("unknown slash name → single regular user node (slash text falls through)", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserNodeForPrompt("/no-such-skill arg", projectDir, skills, null);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].meta).toBeUndefined();
    expect(getText(result.nodes[0])).toBe("/no-such-skill arg");
  });
});
