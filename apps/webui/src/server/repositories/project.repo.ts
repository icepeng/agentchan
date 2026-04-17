import { readFile, mkdir, readdir, rename, rm, cp, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { slugify, scanWorkspaceFiles, type ProjectFile } from "@agentchan/creative-agent";
import type { Project, ProjectMeta } from "../types.js";
import { probeCover } from "../paths.js";

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  modifiedAt?: number;
}

const HIDDEN_ROOTS = new Set(["_project.json", "conversations"]);

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
    const meta: ProjectMeta = { name, createdAt: now, updatedAt: now };

    await ensureProjectDir(slug);
    await Bun.write(projectMetaPath(slug), JSON.stringify(meta, null, 2));

    const destDir = projectDir(slug);
    const entries = await readdir(srcDir, { withFileTypes: true });
    const copies = entries.map((e) =>
      cp(join(srcDir, e.name), join(destDir, e.name), { recursive: e.isDirectory() }),
    );
    await Promise.all(copies);
    return { ...meta, slug };
  }

  return {
    async list(): Promise<(Project & { hasCover: boolean })[]> {
      if (!existsSync(projectsDir)) {
        await mkdir(projectsDir, { recursive: true });
      }

      const entries = await readdir(projectsDir, { withFileTypes: true });
      const results = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (entry) => {
            const metaPath = projectMetaPath(entry.name);
            if (!existsSync(metaPath)) return null;
            const meta = JSON.parse(await readFile(metaPath, "utf-8")) as ProjectMeta;
            const hasCover = (await probeCover(projectDir(entry.name))) !== null;
            return { ...meta, slug: entry.name, hasCover };
          }),
      );

      return results
        .filter((p): p is Project & { hasCover: boolean } => p !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getCoverFile(slug: string): Promise<ReturnType<typeof Bun.file> | null> {
      const name = await probeCover(projectDir(slug));
      if (!name) return null;
      return Bun.file(join(projectDir(slug), name));
    },

    async get(slug: string): Promise<Project | null> {
      const metaPath = projectMetaPath(slug);
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(await readFile(metaPath, "utf-8")) as ProjectMeta;
      return { ...meta, slug };
    },

    async create(name: string): Promise<Project> {
      const slug = uniqueSlug(name);
      const now = Date.now();
      const meta: ProjectMeta = { name, createdAt: now, updatedAt: now };

      await ensureProjectDir(slug);
      await Bun.write(projectMetaPath(slug), JSON.stringify(meta, null, 2));
      return { ...meta, slug };
    },

    async update(
      slug: string,
      updates: { name?: string; notes?: string },
    ): Promise<Project> {
      const metaPath = projectMetaPath(slug);
      if (!existsSync(metaPath)) throw new Error(`Project not found: ${slug}`);
      const existing = JSON.parse(await readFile(metaPath, "utf-8")) as ProjectMeta;

      const newName = updates.name ?? existing.name;
      const newSlug = updates.name ? uniqueSlug(newName) : slug;
      const meta: ProjectMeta = {
        ...existing,
        name: newName,
        updatedAt: Date.now(),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      };

      if (newSlug !== slug) {
        await rename(projectDir(slug), projectDir(newSlug));
      }

      await Bun.write(projectMetaPath(newSlug), JSON.stringify(meta, null, 2));
      return { ...meta, slug: newSlug };
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

    createFromSource,

    async scanWorkspaceFiles(projectSlug: string): Promise<ProjectFile[]> {
      const filesDir = join(projectDir(projectSlug), "files");
      return scanWorkspaceFiles(filesDir);
    },

    async scanProjectTree(slug: string): Promise<TreeEntry[]> {
      const root = projectDir(slug);
      if (!existsSync(root)) return [];

      const dirs: TreeEntry[] = [];
      const filePaths: { relPath: string; absPath: string }[] = [];

      async function walk(dir: string, prefix: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const relPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (!prefix && HIDDEN_ROOTS.has(item.name)) continue;
          if (item.name.startsWith(".")) continue;

          if (item.isDirectory()) {
            dirs.push({ path: relPath, type: "dir" });
            await walk(join(dir, item.name), relPath);
          } else {
            filePaths.push({ relPath, absPath: join(dir, item.name) });
          }
        }
      }

      await walk(root, "");

      const stats = await Promise.all(filePaths.map((f) => stat(f.absPath)));
      const files: TreeEntry[] = filePaths.map((f, i) => ({
        path: f.relPath,
        type: "file" as const,
        modifiedAt: stats[i]!.mtimeMs,
      }));

      return [...dirs, ...files];
    },

    resolveProjectFile(slug: string, filePath: string): { fullPath: string } | null {
      const root = resolve(projectsDir, slug);
      const fullPath = resolve(root, filePath);
      if (!fullPath.startsWith(root + sep)) return null;

      // Block access to hidden roots
      const topSegment = filePath.split(/[/\\]/)[0] ?? "";
      if (HIDDEN_ROOTS.has(topSegment)) return null;

      return { fullPath };
    },

    async readProjectFile(slug: string, filePath: string): Promise<string | null> {
      const resolved = this.resolveProjectFile(slug, filePath);
      if (!resolved) return null;
      try {
        return await readFile(resolved.fullPath, "utf-8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async writeProjectFile(slug: string, filePath: string, content: string): Promise<void> {
      const resolved = this.resolveProjectFile(slug, filePath);
      if (!resolved) throw new Error(`Invalid path: ${filePath}`);
      await Bun.write(resolved.fullPath, content);
    },

    async deleteProjectFile(slug: string, filePath: string): Promise<void> {
      const resolved = this.resolveProjectFile(slug, filePath);
      if (!resolved) throw new Error(`Invalid path: ${filePath}`);
      try {
        await unlink(resolved.fullPath);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EISDIR") throw new Error("Cannot delete directories", { cause: err });
        if (code === "ENOENT") throw new Error("File not found", { cause: err });
        throw err;
      }
    },

    async deleteProjectDir(slug: string, dirPath: string): Promise<void> {
      const resolved = this.resolveProjectFile(slug, dirPath);
      if (!resolved) throw new Error(`Invalid path: ${dirPath}`);
      await rm(resolved.fullPath, { recursive: true });
    },

    async renameProjectEntry(slug: string, fromPath: string, toPath: string): Promise<void> {
      const resolvedFrom = this.resolveProjectFile(slug, fromPath);
      if (!resolvedFrom) throw new Error(`Invalid path: ${fromPath}`);
      const resolvedTo = this.resolveProjectFile(slug, toPath);
      if (!resolvedTo) throw new Error(`Invalid path: ${toPath}`);
      if (dirname(resolvedFrom.fullPath) !== dirname(resolvedTo.fullPath)) {
        await mkdir(dirname(resolvedTo.fullPath), { recursive: true });
      }
      await rename(resolvedFrom.fullPath, resolvedTo.fullPath);
    },

    async createProjectDir(slug: string, dirPath: string): Promise<void> {
      const resolved = this.resolveProjectFile(slug, dirPath);
      if (!resolved) throw new Error(`Invalid path: ${dirPath}`);
      await mkdir(resolved.fullPath, { recursive: true });
    },
  };
}

export type ProjectRepo = ReturnType<typeof createProjectRepo>;
