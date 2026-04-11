import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSafePathSegment } from "../paths.js";

export interface TemplateMeta {
  name: string;
  description?: string;
}

export function createTemplateRepo(templatesDir: string) {
  return {
    async ensureDir(): Promise<void> {
      await mkdir(templatesDir, { recursive: true });
    },

    async list(): Promise<TemplateMeta[]> {
      if (!existsSync(templatesDir)) return [];
      const entries = await readdir(templatesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      const results = await Promise.all(
        dirs.map(async (entry) => {
          const metaPath = join(templatesDir, entry.name, "_template.json");
          if (!existsSync(metaPath)) return null;
          const raw = await readFile(metaPath, "utf-8");
          return JSON.parse(raw) as TemplateMeta;
        }),
      );
      return results.filter((m): m is TemplateMeta => m !== null);
    },

    getSourceDir(name: string): string {
      assertSafePathSegment(name);
      const dir = join(templatesDir, name);
      if (!existsSync(dir)) throw new Error(`Template not found: ${name}`);
      return dir;
    },
  };
}

export type TemplateRepo = ReturnType<typeof createTemplateRepo>;
