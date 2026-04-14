import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "@agentchan/creative-agent";
import { assertSafePathSegment, probeCover } from "../paths.js";

export interface TemplateMeta {
  slug: string;
  name: string;
  description?: string;
}

/** README.md is the single source of truth for template metadata + docs. */
const README = "README.md";

/** Extract `{ name, description }` from parsed frontmatter, falling back to the slug for name. */
function metaFromFrontmatter(
  frontmatter: Record<string, unknown> | null,
  slug: string,
): { name: string; description?: string } {
  const name =
    typeof frontmatter?.name === "string" && frontmatter.name.trim().length > 0
      ? frontmatter.name
      : slug;
  const description =
    typeof frontmatter?.description === "string" ? frontmatter.description : undefined;
  return { name, description };
}

export function createTemplateRepo(templatesDir: string) {
  async function readReadme(slug: string): Promise<string | null> {
    try {
      return await readFile(join(templatesDir, slug, README), "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

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
          const raw = await readReadme(entry.name);
          if (raw === null) return null;
          const { frontmatter } = parseFrontmatter(raw);
          const meta = metaFromFrontmatter(frontmatter, entry.name);
          const hasCover = (await probeCover(join(templatesDir, entry.name))) !== null;
          return { slug: entry.name, ...meta, hasCover };
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

    async getReadme(name: string): Promise<string> {
      assertSafePathSegment(name);
      return (await readReadme(name)) ?? "";
    },

    getSourceDir(name: string): string {
      assertSafePathSegment(name);
      const dir = join(templatesDir, name);
      if (!existsSync(dir)) throw new Error(`Template not found: ${name}`);
      return dir;
    },

    exists(name: string): boolean {
      assertSafePathSegment(name);
      return existsSync(join(templatesDir, name, README));
    },

    async remove(name: string): Promise<void> {
      assertSafePathSegment(name);
      await rm(join(templatesDir, name), { recursive: true, force: true });
    },

    /**
     * Create the template directory and write `README.md` with `{ name, description }`
     * frontmatter. If the file already exists, only the frontmatter is replaced —
     * the body is preserved so a template's docs survive metadata edits.
     */
    async ensureTemplateDir(name: string, meta: { name: string; description?: string }): Promise<string> {
      assertSafePathSegment(name);
      const dir = join(templatesDir, name);
      await mkdir(dir, { recursive: true });

      const existingRaw = (await readReadme(name)) ?? "";
      const { body } = parseFrontmatter(existingRaw);
      const nextBody = body.length > 0 ? body : `\n# ${meta.name}\n`;
      const content = stringifyFrontmatter(
        { name: meta.name, description: meta.description },
        nextBody,
      );
      await Bun.write(join(dir, README), content);
      return dir;
    },
  };
}

export type TemplateRepo = ReturnType<typeof createTemplateRepo>;
