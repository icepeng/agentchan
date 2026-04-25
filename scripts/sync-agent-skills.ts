#!/usr/bin/env bun

import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SkillRoot = "agents" | "claude";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = [
  "agent-browser",
  "character-images",
  "cover-image",
  "interview",
  "playtest",
  "portless",
  "update-deps",
  "vercel-composition-patterns",
  "vercel-react-best-practices",
];

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".lock",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

function usage(): never {
  console.error(
    "Usage: bun scripts/sync-agent-skills.ts [--from agents|claude] [--check]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let from: SkillRoot = "agents";
let check = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--from") {
    const value = args[++i];
    if (value !== "agents" && value !== "claude") usage();
    from = value;
  } else if (arg === "--check") {
    check = true;
  } else {
    usage();
  }
}

const to: SkillRoot = from === "agents" ? "claude" : "agents";
const sourceRoot = resolve(ROOT, from === "agents" ? ".agents/skills" : ".claude/skills");
const targetRoot = resolve(ROOT, to === "agents" ? ".agents/skills" : ".claude/skills");

function assertUnderRoot(path: string) {
  const rel = relative(ROOT, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refusing to touch path outside repository: ${path}`);
  }
}

function shouldIgnore(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return (
    normalized.includes("/node_modules/") ||
    normalized.endsWith("/.play-state.json") ||
    normalized.endsWith("/.DS_Store")
  );
}

function rewriteForTarget(content: Buffer) {
  const text = content.toString("utf8");
  if (to === "agents") {
    return Buffer.from(text.replaceAll(".claude/skills", ".agents/skills"));
  }
  return Buffer.from(text.replaceAll(".agents/skills", ".claude/skills"));
}

function isTextFile(path: string) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

async function listFiles(base: string, dir = base): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (shouldIgnore(fullPath)) continue;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(base, fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath.slice(base.length + 1));
    }
  }

  return files.sort();
}

async function copySkill(skill: string) {
  const sourceDir = resolve(sourceRoot, skill);
  const targetDir = resolve(targetRoot, skill);
  assertUnderRoot(sourceDir);
  assertUnderRoot(targetDir);

  if (!existsSync(sourceDir)) {
    throw new Error(`Missing source skill: ${sourceDir}`);
  }

  await rm(targetDir, { recursive: true, force: true });
  const files = await listFiles(sourceDir);

  for (const file of files) {
    const sourceFile = join(sourceDir, file);
    const targetFile = join(targetDir, file);
    assertUnderRoot(targetFile);

    const content = await readFile(sourceFile);
    const output = isTextFile(sourceFile) ? rewriteForTarget(content) : content;
    await mkdir(dirname(targetFile), { recursive: true });
    await writeFile(targetFile, output);
  }
}

async function checkSkill(skill: string) {
  const sourceDir = resolve(sourceRoot, skill);
  const targetDir = resolve(targetRoot, skill);
  const problems: string[] = [];

  if (!existsSync(sourceDir)) return [`missing source skill: ${sourceDir}`];
  if (!existsSync(targetDir)) return [`missing target skill: ${targetDir}`];

  const sourceFiles = await listFiles(sourceDir);
  const targetFiles = await listFiles(targetDir);
  const allFiles = new Set([...sourceFiles, ...targetFiles]);

  for (const file of [...allFiles].sort()) {
    const sourceFile = join(sourceDir, file);
    const targetFile = join(targetDir, file);
    if (!sourceFiles.includes(file)) {
      problems.push(`extra target file: ${skill}/${file}`);
      continue;
    }
    if (!targetFiles.includes(file)) {
      problems.push(`missing target file: ${skill}/${file}`);
      continue;
    }

    const sourceInfo = await stat(sourceFile);
    const targetInfo = await stat(targetFile);
    if (sourceInfo.size === targetInfo.size && !isTextFile(sourceFile)) {
      const [sourceContent, targetContent] = await Promise.all([
        readFile(sourceFile),
        readFile(targetFile),
      ]);
      if (!sourceContent.equals(targetContent)) {
        problems.push(`content differs: ${skill}/${file}`);
      }
      continue;
    }

    const expected = isTextFile(sourceFile)
      ? rewriteForTarget(await readFile(sourceFile))
      : await readFile(sourceFile);
    const actual = await readFile(targetFile);
    if (!expected.equals(actual)) {
      problems.push(`content differs: ${skill}/${file}`);
    }
  }

  return problems;
}

if (check) {
  const problems = (await Promise.all(SKILLS.map(checkSkill))).flat();
  if (problems.length > 0) {
    console.error(`Skill mirror check failed (${from} -> ${to}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`Skill mirror check passed (${from} -> ${to}).`);
} else {
  for (const skill of SKILLS) {
    await copySkill(skill);
    console.log(`synced ${skill}: ${from} -> ${to}`);
  }
}
