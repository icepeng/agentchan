import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveModel } from "../../src/agent/orchestrator.js";
import { loadEnvironmentSkills } from "../../src/agent/skill-environment.js";
import { assembleAgentTools } from "../../src/agent/tool-assembly.js";
import { buildSystemPrompt } from "../../src/agent/system-prompt.js";

let projectDir: string;

const CREATIVE_SKILL = `---
name: creative-skill
description: creative only
---

# Creative Skill`;

const META_SKILL = `---
name: meta-skill
description: meta only
environment: meta
---

# Meta Skill`;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "orchestrator-helpers-"));
  await mkdir(join(projectDir, "skills", "creative-skill"), { recursive: true });
  await mkdir(join(projectDir, "skills", "meta-skill"), { recursive: true });
  await writeFile(join(projectDir, "skills", "creative-skill", "SKILL.md"), CREATIVE_SKILL);
  await writeFile(join(projectDir, "skills", "meta-skill", "SKILL.md"), META_SKILL);
  await writeFile(join(projectDir, "SYSTEM.md"), "creative system");
  await writeFile(join(projectDir, "SYSTEM.meta.md"), "meta system");
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe("orchestrator helpers", () => {
  test("filters skills by session environment", async () => {
    const creativeSkills = await loadEnvironmentSkills(projectDir, "creative");
    const metaSkills = await loadEnvironmentSkills(projectDir, "meta");

    expect([...creativeSkills.keys()]).toEqual(["creative-skill"]);
    expect([...metaSkills.keys()]).toEqual(["meta-skill"]);
  });

  test("assembles creative and meta tools in the existing order", async () => {
    const creativeSkills = await loadEnvironmentSkills(projectDir, "creative");
    const metaSkills = await loadEnvironmentSkills(projectDir, "meta");

    const creativeTools = assembleAgentTools(projectDir, creativeSkills);
    const metaTools = assembleAgentTools(projectDir, metaSkills);

    expect(creativeTools.map((tool) => tool.name)).toEqual([
      "script",
      "read",
      "write",
      "append",
      "edit",
      "grep",
      "tree",
      "activate_skill",
    ]);
    expect(metaTools.map((tool) => tool.name)).toEqual([
      "script",
      "read",
      "write",
      "append",
      "edit",
      "grep",
      "tree",
      "activate_skill",
    ]);
  });

  test("builds prompts from the matching system file and skill catalog", async () => {
    const creativeSkills = await loadEnvironmentSkills(projectDir, "creative");
    const metaSkills = await loadEnvironmentSkills(projectDir, "meta");

    const creativePrompt = await buildSystemPrompt(projectDir, creativeSkills);
    const metaPrompt = await buildSystemPrompt(projectDir, metaSkills, "meta");

    expect(creativePrompt).toContain("creative system");
    expect(creativePrompt).toContain("- creative-skill: creative only");
    expect(creativePrompt).not.toContain("meta system");
    expect(creativePrompt).not.toContain("- meta-skill: meta only");

    expect(metaPrompt).toContain("meta system");
    expect(metaPrompt).toContain("- meta-skill: meta only");
    expect(metaPrompt).not.toContain("creative system");
    expect(metaPrompt).not.toContain("- creative-skill: creative only");
  });

  test("keeps custom provider model resolution behavior", () => {
    const model = resolveModel("custom", "local-model", {
      baseUrl: "http://localhost:11434",
      apiFormat: "openai-completions",
    });

    expect(model).toMatchObject({
      id: "local-model",
      name: "local-model",
      api: "openai-completions",
      provider: "custom",
      baseUrl: "http://localhost:11434",
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 16_000,
    });
  });
});
