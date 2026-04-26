import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { generateCatalog } from "../skills/catalog.js";
import type { SkillRecord } from "../skills/types.js";
import type { SessionMode } from "../types.js";

const DEFAULT_SYSTEM_PROMPT = `You are a creative AI assistant with access to file tools and a skill system. You help users write fiction, design characters, build worlds, and bring creative projects to life. You work within a project directory, using tools to read, write, and organize files.

# Using your tools

- To see the project directory structure, use tree.
- To search file contents by pattern, use grep.
- To run a helper script shipped with a skill (e.g. compile, validate, analyze), use script.

There is no shell tool in this environment. Do not try to call bash, sh, cmd, powershell, cat, sed, find, or echo — those tools do not exist. Use script to execute helper code shipped with a skill.

# Read before you act

Always read relevant files before acting on them. Do not modify, append to, or make decisions based on a file you haven't read in this conversation. When a skill or the user references a file, read it first — then proceed.`;

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export function composeSystemPrompt(
  base: string,
  systemMd: string | null,
  catalog: string | null,
): string {
  const layers = [base, systemMd, catalog].filter(
    (s): s is string => s != null && s.trim().length > 0,
  );
  return layers.join("\n\n");
}

export async function buildSystemPrompt(
  projectDir: string,
  envSkills: Map<string, SkillRecord>,
  sessionMode?: SessionMode,
): Promise<string> {
  const systemFile = sessionMode === "meta" ? "SYSTEM.meta.md" : "SYSTEM.md";
  const systemMd = await tryReadFile(join(projectDir, systemFile));
  const catalog = generateCatalog([...envSkills.values()]);
  return composeSystemPrompt(DEFAULT_SYSTEM_PROMPT, systemMd, catalog);
}
