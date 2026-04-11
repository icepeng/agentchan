import { readFile, mkdir, readdir, rename, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { slugify, scanWorkspaceFiles, type ProjectFile } from "@agentchan/creative-agent";
import type { Project } from "../types.js";

export function createProjectRepo(projectsDir: string) {
  function projectDir(slug: string): string {
    return join(projectsDir, slug);
  }

  function projectMetaPath(slug: string): string {
    return join(projectsDir, slug, "_project.json");
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
    while (existsSync(join(projectsDir, slug))) {
      slug = `${base}-${i}`;
      i++;
    }
    return slug;
  }

  async function createFromSource(name: string, srcDir: string): Promise<Project> {
    const slug = uniqueSlug(name);
    const now = Date.now();
    const project: Project = { slug, name, createdAt: now, updatedAt: now };

    await ensureProjectDir(slug);
    await Bun.write(projectMetaPath(slug), JSON.stringify(project, null, 2));

    const destDir = projectDir(slug);
    const copies: Promise<void>[] = [];

    for (const sub of ["skills", "files"] as const) {
      const src = join(srcDir, sub);
      if (existsSync(src)) {
        copies.push(cp(src, join(destDir, sub), { recursive: true }));
      }
    }

    for (const file of ["renderer.ts", "SYSTEM.md"] as const) {
      const src = join(srcDir, file);
      if (existsSync(src)) {
        copies.push(cp(src, join(destDir, file)));
      }
    }

    await Promise.all(copies);
    return project;
  }

  return {
    async list(): Promise<Project[]> {
      if (!existsSync(projectsDir)) {
        await mkdir(projectsDir, { recursive: true });
      }

      const entries = await readdir(projectsDir, { withFileTypes: true });
      const projects: Project[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = projectMetaPath(entry.name);
        if (!existsSync(metaPath)) continue;

        const meta = JSON.parse(await readFile(metaPath, "utf-8")) as Project;
        projects.push(meta);
      }

      return projects.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async get(slug: string): Promise<Project | null> {
      const metaPath = projectMetaPath(slug);
      if (!existsSync(metaPath)) return null;
      return JSON.parse(await readFile(metaPath, "utf-8")) as Project;
    },

    async create(name: string): Promise<Project> {
      const slug = uniqueSlug(name);
      const now = Date.now();

      const project: Project = { slug, name, createdAt: now, updatedAt: now };

      await ensureProjectDir(slug);
      await Bun.write(projectMetaPath(slug), JSON.stringify(project, null, 2));
      return project;
    },

    async update(
      slug: string,
      updates: { name?: string; notes?: string },
    ): Promise<Project> {
      const metaPath = projectMetaPath(slug);
      if (!existsSync(metaPath)) throw new Error(`Project not found: ${slug}`);
      const existing = JSON.parse(await readFile(metaPath, "utf-8")) as Project;

      const newName = updates.name ?? existing.name;
      const newSlug = updates.name ? uniqueSlug(newName) : slug;
      const updated: Project = {
        ...existing,
        slug: newSlug,
        name: newName,
        updatedAt: Date.now(),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      };

      if (newSlug !== slug) {
        await rename(projectDir(slug), projectDir(newSlug));
      }

      await Bun.write(projectMetaPath(newSlug), JSON.stringify(updated, null, 2));
      return updated;
    },

    async delete(slug: string): Promise<void> {
      const dir = projectDir(slug);
      if (!existsSync(dir)) return;
      await rm(dir, { recursive: true });
    },

    async duplicate(sourceSlug: string, name: string): Promise<Project> {
      if (!existsSync(projectMetaPath(sourceSlug))) {
        throw new Error(`Source project not found: ${sourceSlug}`);
      }
      return createFromSource(name, projectDir(sourceSlug));
    },

    async getSystem(slug: string): Promise<string | null> {
      const path = join(projectDir(slug), "SYSTEM.md");
      if (!existsSync(path)) return null;
      return readFile(path, "utf-8");
    },

    async saveSystem(slug: string, content: string): Promise<void> {
      await ensureProjectDir(slug);
      await Bun.write(join(projectDir(slug), "SYSTEM.md"), content);
    },

    async createFromTemplate(name: string, templateDir: string): Promise<Project> {
      return createFromSource(name, templateDir);
    },

    async scanWorkspaceFiles(projectSlug: string): Promise<ProjectFile[]> {
      const filesDir = join(projectDir(projectSlug), "files");
      return scanWorkspaceFiles(filesDir);
    },
  };
}

export type ProjectRepo = ReturnType<typeof createProjectRepo>;
