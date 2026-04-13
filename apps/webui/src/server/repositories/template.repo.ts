import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSafePathSegment, probeCover } from "../paths.js";

export interface TemplateMeta {
  slug: string;
  name: string;
  description?: string;
}

export function createTemplateRepo(templatesDir: string) {
  return {
    async ensureDir(): Promise<void> {
      await mkdir(templatesDir, { recursive: true });
    },

    async list(): Promise<(TemplateMeta & { hasCover: boolean })[]> {
      if (!existsSync(templatesDir)) return [];
      const entries = await readdir(templatesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      const results = await Promise.all(
        dirs.map(async (entry) => {
          const metaPath = join(templatesDir, entry.name, "_template.json");
          if (!existsSync(metaPath)) return null;
          const raw = await readFile(metaPath, "utf-8");
          const meta = JSON.parse(raw) as { name: string; description?: string };
          const hasCover = (await probeCover(join(templatesDir, entry.name))) !== null;
          return { slug: entry.name, ...meta, hasCover } as TemplateMeta & { hasCover: boolean };
        }),
      );
      return results.filter((m): m is TemplateMeta & { hasCover: boolean } => m !== null);
    },

    async getCoverFile(name: string): Promise<ReturnType<typeof Bun.file> | null> {
      assertSafePathSegment(name);
      const coverName = await probeCover(join(templatesDir, name));
      if (!coverName) return null;
      return Bun.file(join(templatesDir, name, coverName));
    },

    getSourceDir(name: string): string {
      assertSafePathSegment(name);
      const dir = join(templatesDir, name);
      if (!existsSync(dir)) throw new Error(`Template not found: ${name}`);
      return dir;
    },

    exists(name: string): boolean {
      assertSafePathSegment(name);
      return existsSync(join(templatesDir, name, "_template.json"));
    },

    async remove(name: string): Promise<void> {
      assertSafePathSegment(name);
      await rm(join(templatesDir, name), { recursive: true, force: true });
    },

    async ensureTemplateDir(name: string, meta: { name: string; description?: string }): Promise<string> {
      assertSafePathSegment(name);
      const dir = join(templatesDir, name);
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "_template.json"), JSON.stringify(meta, null, 2));
      return dir;
    },
  };
}

export type TemplateRepo = ReturnType<typeof createTemplateRepo>;
