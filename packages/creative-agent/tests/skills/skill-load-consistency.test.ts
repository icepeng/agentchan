import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildAlwaysActiveSeedNode,
  buildCatalogReminderNode,
  buildUserNodeForPrompt,
} from "../../src/agent/build.js";
import { discoverProjectSkills } from "../../src/skills/discovery.js";
import { SKILL_CONTENT_PREFIX } from "../../src/skills/skill-content.js";
import { SkillManager, type SkillLoadEvent } from "../../src/skills/manager.js";
import type { ContentBlock, TreeNode } from "../../src/types.js";

// Three skill-injection paths must produce nodes with a consistent shape
// (`role: "user"`, `meta: "skill-load"`, `content[0]` text starting with
// SKILL_CONTENT_PREFIX) so MessageBubble's single meta gate works for all of
// them and convert.ts merges them into the LLM context the same way.

const ALWAYS_SKILL = `---
name: always-character
description: an always-active character
always-active: true
---

# Always Character

I am loaded automatically at conversation start.`;

const INVOCABLE_SKILL = `---
name: invocable-character
description: an invocable character
---

# Invocable Character

I am loaded on demand via slash or activate_skill.`;

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "skill-consistency-"));
  const skillsDir = join(projectDir, "skills");
  await mkdir(join(skillsDir, "always-character"), { recursive: true });
  await mkdir(join(skillsDir, "invocable-character"), { recursive: true });
  await writeFile(join(skillsDir, "always-character", "SKILL.md"), ALWAYS_SKILL);
  await writeFile(join(skillsDir, "invocable-character", "SKILL.md"), INVOCABLE_SKILL);
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function getText(node: TreeNode): string {
  const block = node.content[0];
  if (block?.type !== "text") throw new Error("expected first content block to be text");
  return block.text;
}

function getBlockText(content: ContentBlock[]): string {
  const block = content[0];
  if (block?.type !== "text") throw new Error("expected first content block to be text");
  return block.text;
}

/** Drive a SkillManager.activate_skill call and return the captured load event. */
async function captureSkillLoad(
  manager: SkillManager,
  skillName: string,
): Promise<SkillLoadEvent> {
  let loaded: SkillLoadEvent | null = null;
  manager.setOnSkillLoad((load) => {
    loaded = load;
  });
  await manager.createTool().execute("test-call-id", { name: skillName });
  if (!loaded) throw new Error("onSkillLoad was never invoked");
  return loaded;
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

describe("skill-load shape — three injection paths", () => {
  test("always-active path: buildAlwaysActiveSeedNode", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const node = buildAlwaysActiveSeedNode(projectDir, skills, null);
    expect(node).not.toBeNull();
    assertSkillLoadShape(node!, "always-character");
    expect(node!.parentId).toBeNull();
  });

  test("slash invocation path: buildUserNodeForPrompt returns [chip, userText]", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserNodeForPrompt(
      "/invocable-character hello world",
      projectDir,
      skills,
      "leaf-id",
    );

    expect(result.nodes).toHaveLength(2);
    const [chipNode, userNode] = result.nodes;

    // Chip-first ordering: regenerate/branch from descendants of userNode
    // always replays the skill body via history.
    assertSkillLoadShape(chipNode, "invocable-character");
    expect(chipNode.parentId).toBe("leaf-id");

    expect(userNode.role).toBe("user");
    expect(userNode.meta).toBeUndefined();
    expect(userNode.parentId).toBe(chipNode.id);
    const userText = getText(userNode);
    expect(userText).toContain("<command-name>/invocable-character</command-name>");
    expect(userText).toContain("<command-args>hello world</command-args>");

    // llmText is the user-input node's text — convert.ts merges the chip
    // (left in history) with this new prompt into one user message.
    expect(result.llmText).toBe(userText);
  });

  test("activate_skill path: SkillManager fires onSkillLoad with a ContentBlock[] payload", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const manager = new SkillManager(skills, projectDir);

    const loaded = await captureSkillLoad(manager, "invocable-character");
    expect(loaded.skillName).toBe("invocable-character");

    // runPrompt's onSkillLoad callback turns this payload directly into a
    // meta:"skill-load" TreeNode (via buildSkillLoadNode), so the contract is
    // simply: a single text block whose body is the canonical skill wrapper.
    expect(loaded.content).toHaveLength(1);
    const text = getBlockText(loaded.content);
    expect(text.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
    expect(text).toContain('name="invocable-character"');
    expect(text).toContain("</skill_content>");
  });
});

describe("skill-load wire format consistency across paths", () => {
  test("slash and activate_skill produce byte-identical text for the same skill", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const slashResult = buildUserNodeForPrompt(
      "/invocable-character",
      projectDir,
      skills,
      null,
    );
    const slashChipText = getText(slashResult.nodes[0]);

    const manager = new SkillManager(skills, projectDir);
    const loaded = await captureSkillLoad(manager, "invocable-character");
    const activatedText = getBlockText(loaded.content);

    expect(slashChipText).toBe(activatedText);
  });

  test("all three paths share the canonical wrapper format", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const alwaysText = getText(
      buildAlwaysActiveSeedNode(projectDir, skills, null)!,
    );
    const slashChipText = getText(
      buildUserNodeForPrompt("/invocable-character", projectDir, skills, null).nodes[0],
    );
    const manager = new SkillManager(skills, projectDir);
    const loaded = await captureSkillLoad(manager, "invocable-character");
    const activatedText = getBlockText(loaded.content);

    for (const text of [alwaysText, slashChipText, activatedText]) {
      expect(text.startsWith(SKILL_CONTENT_PREFIX)).toBe(true);
      expect(text).toContain('<skill_content name="');
      expect(text).toContain("</skill_content>");
      expect(text).toContain("Skill directory:");
    }
  });
});

describe("skill catalog reminder node", () => {
  test("emits a meta:skill-catalog user node wrapped in <system-reminder>", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const node = buildCatalogReminderNode(skills, null);
    expect(node).not.toBeNull();
    expect(node!.role).toBe("user");
    expect(node!.meta).toBe("skill-catalog");
    expect(node!.parentId).toBeNull();
    expect(node!.content).toHaveLength(1);

    const text = getText(node!);
    expect(text.startsWith("<system-reminder>")).toBe(true);
    expect(text.trimEnd().endsWith("</system-reminder>")).toBe(true);

    // Always-active skills appear with an `(already loaded)` marker.
    expect(text).toContain("always-character (already loaded)");
    // Invocable skills appear without the marker.
    expect(text).toMatch(/- invocable-character:/);
    expect(text).not.toContain("invocable-character (already loaded)");

    // The reminder explicitly forbids re-activating already-loaded skills
    // and guides the model on how to call activate_skill for invocables.
    expect(text).toContain("Do NOT call `activate_skill`");
    expect(text).toContain("activate_skill");
  });

  test("returns null when no skills are visible to the model", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "skill-empty-"));
    try {
      await mkdir(join(emptyDir, "skills"), { recursive: true });
      const skills = await discoverProjectSkills(join(emptyDir, "skills"));
      const node = buildCatalogReminderNode(skills, null);
      expect(node).toBeNull();
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

  test("always-active skill cannot be slash-invoked → falls through as plain text", async () => {
    const skills = await discoverProjectSkills(join(projectDir, "skills"));
    const result = buildUserNodeForPrompt("/always-character hi", projectDir, skills, null);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].meta).toBeUndefined();
    expect(getText(result.nodes[0])).toBe("/always-character hi");
  });
});
