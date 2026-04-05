import { readFile, mkdir, readdir, rename, rm, stat, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  createSessionStorage,
  type SessionStorage,
  slugify,
} from "@agentchan/creative-agent";
import type { Project, OutputFile } from "../types.js";
import { PROJECTS_DIR } from "../paths.js";

// --- Session storage instance (conversation CRUD delegated to creative-agent) ---

export const sessionStorage: SessionStorage = createSessionStorage(PROJECTS_DIR);

// Re-export slugify for use in project routes
export { slugify };

// --- Project path helpers ---

function projectDir(slug: string): string {
  return join(PROJECTS_DIR, slug);
}

function projectMetaPath(slug: string): string {
  return join(PROJECTS_DIR, slug, "_project.json");
}

async function ensureProjectDir(slug: string): Promise<void> {
  const dir = projectDir(slug);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function uniqueSlug(name: string): string {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (existsSync(join(PROJECTS_DIR, slug))) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

// --- Project CRUD ---

export async function listProjects(): Promise<Project[]> {
  if (!existsSync(PROJECTS_DIR)) {
    await mkdir(PROJECTS_DIR, { recursive: true });
  }

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = projectMetaPath(entry.name);
    if (!existsSync(metaPath)) continue;

    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as Project;
    projects.push(meta);
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(name: string): Promise<Project> {
  const slug = uniqueSlug(name);
  const now = Date.now();

  const project: Project = {
    slug,
    name,
    createdAt: now,
    updatedAt: now,
  };

  await ensureProjectDir(slug);
  await Bun.write(projectMetaPath(slug), JSON.stringify(project, null, 2));
  return project;
}

export async function duplicateProject(sourceSlug: string, name: string): Promise<Project> {
  const source = await getProject(sourceSlug);
  if (!source) throw new Error(`Source project not found: ${sourceSlug}`);

  const slug = uniqueSlug(name);
  const now = Date.now();

  const project: Project = {
    slug,
    name,
    createdAt: now,
    updatedAt: now,
    ...(source.outputDir ? { outputDir: source.outputDir } : {}),
  };

  await ensureProjectDir(slug);
  await Bun.write(projectMetaPath(slug), JSON.stringify(project, null, 2));

  const srcDir = projectDir(sourceSlug);
  const destDir = projectDir(slug);
  const copies: Promise<void>[] = [];

  const srcSkills = join(srcDir, "skills");
  if (existsSync(srcSkills)) {
    copies.push(cp(srcSkills, join(destDir, "skills"), { recursive: true }));
  }

  const srcRenderer = join(srcDir, "renderer.ts");
  if (existsSync(srcRenderer)) {
    copies.push(cp(srcRenderer, join(destDir, "renderer.ts")));
  }

  await Promise.all(copies);

  return project;
}

export async function getProject(slug: string): Promise<Project | null> {
  const metaPath = projectMetaPath(slug);
  if (!existsSync(metaPath)) return null;
  return JSON.parse(await readFile(metaPath, "utf-8")) as Project;
}

export async function updateProject(
  slug: string,
  updates: { name?: string; outputDir?: string; notes?: string },
): Promise<Project> {
  const existing = await getProject(slug);
  if (!existing) throw new Error(`Project not found: ${slug}`);

  const newName = updates.name ?? existing.name;
  const newSlug = updates.name ? uniqueSlug(newName) : slug;
  const updated: Project = {
    ...existing,
    slug: newSlug,
    name: newName,
    updatedAt: Date.now(),
    ...(updates.outputDir !== undefined ? { outputDir: updates.outputDir } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  };

  if (newSlug !== slug) {
    await rename(projectDir(slug), projectDir(newSlug));
  }

  await Bun.write(projectMetaPath(newSlug), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteProject(slug: string): Promise<void> {
  const projects = await listProjects();
  if (projects.length <= 1) throw new Error("Cannot delete the last project");

  const dir = projectDir(slug);
  if (!existsSync(dir)) return;

  await rm(dir, { recursive: true });
}

export async function ensureInitialProject(): Promise<void> {
  const projects = await listProjects();
  if (projects.length > 0) return;
  await createProject("General");
}

// --- Output files (for renderer system) ---

export async function readOutputFiles(
  projectSlug: string,
  outputDirName: string = "output",
): Promise<OutputFile[]> {
  const projectBase = resolve(projectDir(projectSlug));
  const baseDir = resolve(join(projectBase, outputDirName));
  if (!baseDir.startsWith(projectBase)) {
    throw new Error("Invalid output directory");
  }
  if (!existsSync(baseDir)) return [];

  const files: OutputFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        try {
          const content = await readFile(fullPath, "utf-8");
          const fileStat = await stat(fullPath);
          files.push({
            path: relative(baseDir, fullPath).replace(/\\/g, "/"),
            content,
            modifiedAt: fileStat.mtimeMs,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(baseDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
