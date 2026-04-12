import { existsSync } from "node:fs";
import { cp, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { assertSafePathSegment } from "../paths.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

interface SaveAsTemplateOptions {
  name: string;
  description?: string;
  excludeFiles: string[];
  overwrite: boolean;
}

export function createTemplateService(templateRepo: TemplateRepo, projectsDir: string) {
  async function copyFilesSelectively(
    srcDir: string,
    destDir: string,
    excludeSet: Set<string>,
  ): Promise<void> {
    async function walk(dir: string, prefix: string) {
      const items = await readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const relPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.isDirectory()) {
          await walk(join(dir, item.name), relPath);
        } else {
          if (excludeSet.has(relPath)) continue;
          const destPath = join(destDir, relPath);
          await mkdir(dirname(destPath), { recursive: true });
          await cp(join(dir, item.name), destPath);
        }
      }
    }
    await walk(srcDir, "");
  }

  return {
    async list() { return templateRepo.list(); },
    getSourceDir(name: string) { return templateRepo.getSourceDir(name); },

    async saveProjectAsTemplate(
      projectSlug: string,
      opts: SaveAsTemplateOptions,
    ): Promise<{ saved: boolean; conflict?: boolean }> {
      assertSafePathSegment(projectSlug);
      const { name, description, excludeFiles, overwrite } = opts;
      const srcDir = join(projectsDir, projectSlug);

      if (!overwrite && templateRepo.exists(name)) {
        return { saved: false, conflict: true };
      }
      if (overwrite) {
        await templateRepo.remove(name);
      }

      const destDir = await templateRepo.ensureTemplateDir(name, { name, description });

      const copies: Promise<void>[] = [];
      for (const file of ["SYSTEM.md", "renderer.ts"] as const) {
        const src = join(srcDir, file);
        if (existsSync(src)) {
          copies.push(cp(src, join(destDir, file)));
        }
      }
      const skillsSrc = join(srcDir, "skills");
      if (existsSync(skillsSrc)) {
        copies.push(cp(skillsSrc, join(destDir, "skills"), { recursive: true }));
      }
      await Promise.all(copies);

      const filesSrc = join(srcDir, "files");
      if (existsSync(filesSrc)) {
        const excludeSet = new Set(excludeFiles);
        await copyFilesSelectively(filesSrc, join(destDir, "files"), excludeSet);
      }

      return { saved: true };
    },
  };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
