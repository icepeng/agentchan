import { readFile, readdir, rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverProjectSkills, type SkillMetadata } from "@agentchan/creative-agent";
import { LIBRARY_DIR, PROJECTS_DIR, assertSafePathSegment } from "../paths.js";

const SKILLS_DIR = join(LIBRARY_DIR, "skills");
const RENDERERS_DIR = join(LIBRARY_DIR, "renderers");

// --- Bootstrap ---

export async function ensureLibrary(): Promise<void> {
  if (!existsSync(SKILLS_DIR)) await mkdir(SKILLS_DIR, { recursive: true });
  if (!existsSync(RENDERERS_DIR)) await mkdir(RENDERERS_DIR, { recursive: true });
}

// --- Library Skills ---

export async function listLibrarySkills(): Promise<SkillMetadata[]> {
  const skills = await discoverProjectSkills(SKILLS_DIR);
  return [...skills.values()].map((s) => s.meta);
}

export async function getLibrarySkill(name: string): Promise<string | null> {
  assertSafePathSegment(name);
  const path = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}

export async function createLibrarySkill(name: string, content: string): Promise<void> {
  assertSafePathSegment(name);
  const dir = join(SKILLS_DIR, name);
  if (existsSync(dir)) throw new Error(`Skill already exists: ${name}`);
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "SKILL.md"), content);
}

export async function updateLibrarySkill(name: string, content: string): Promise<void> {
  assertSafePathSegment(name);
  const path = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(path)) throw new Error(`Skill not found: ${name}`);
  await Bun.write(path, content);
}

export async function deleteLibrarySkill(name: string): Promise<void> {
  assertSafePathSegment(name);
  const dir = join(SKILLS_DIR, name);
  if (!existsSync(dir)) throw new Error(`Skill not found: ${name}`);
  await rm(dir, { recursive: true });
}

// --- Library Renderers ---

export async function listLibraryRenderers(): Promise<Array<{ name: string }>> {
  if (!existsSync(RENDERERS_DIR)) return [];
  const entries = await readdir(RENDERERS_DIR);
  return entries
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: f.replace(/\.ts$/, "") }));
}

export async function getLibraryRenderer(name: string): Promise<string | null> {
  assertSafePathSegment(name);
  const path = join(RENDERERS_DIR, `${name}.ts`);
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}

export async function createLibraryRenderer(name: string, source: string): Promise<void> {
  assertSafePathSegment(name);
  const path = join(RENDERERS_DIR, `${name}.ts`);
  if (existsSync(path)) throw new Error(`Renderer already exists: ${name}`);
  await Bun.write(path, source);
}

export async function updateLibraryRenderer(name: string, source: string): Promise<void> {
  assertSafePathSegment(name);
  const path = join(RENDERERS_DIR, `${name}.ts`);
  if (!existsSync(path)) throw new Error(`Renderer not found: ${name}`);
  await Bun.write(path, source);
}

export async function deleteLibraryRenderer(name: string): Promise<void> {
  assertSafePathSegment(name);
  const path = join(RENDERERS_DIR, `${name}.ts`);
  if (!existsSync(path)) throw new Error(`Renderer not found: ${name}`);
  await rm(path);
}

// --- Copy skill to project ---

export async function copySkillToProject(skillName: string, projectSlug: string): Promise<void> {
  assertSafePathSegment(skillName);
  const src = join(SKILLS_DIR, skillName);
  if (!existsSync(src)) throw new Error(`Library skill not found: ${skillName}`);

  const dest = join(PROJECTS_DIR, projectSlug, "skills", skillName);
  if (existsSync(dest)) throw new Error(`Skill already exists in project: ${skillName}`);

  await mkdir(join(PROJECTS_DIR, projectSlug, "skills"), { recursive: true });
  await cp(src, dest, { recursive: true });
}

// --- Project Skills CRUD ---

export async function getProjectSkill(projectSlug: string, name: string): Promise<string | null> {
  assertSafePathSegment(name);
  const path = join(PROJECTS_DIR, projectSlug, "skills", name, "SKILL.md");
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}

export async function createProjectSkill(
  projectSlug: string,
  name: string,
  content: string,
): Promise<void> {
  assertSafePathSegment(name);
  const dir = join(PROJECTS_DIR, projectSlug, "skills", name);
  if (existsSync(dir)) throw new Error(`Skill already exists in project: ${name}`);
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "SKILL.md"), content);
}

export async function updateProjectSkill(
  projectSlug: string,
  name: string,
  content: string,
): Promise<void> {
  assertSafePathSegment(name);
  const path = join(PROJECTS_DIR, projectSlug, "skills", name, "SKILL.md");
  if (!existsSync(path)) throw new Error(`Skill not found in project: ${name}`);
  await Bun.write(path, content);
}

export async function deleteProjectSkill(projectSlug: string, name: string): Promise<void> {
  assertSafePathSegment(name);
  const dir = join(PROJECTS_DIR, projectSlug, "skills", name);
  if (!existsSync(dir)) throw new Error(`Skill not found in project: ${name}`);
  await rm(dir, { recursive: true });
}
