import { readFile, readdir, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverProjectSkills, type SkillMetadata } from "@agentchan/creative-agent";
import { assertSafePathSegment } from "../paths.js";

export function createLibraryRepo(libraryDir: string) {
  const skillsDir = join(libraryDir, "skills");
  const renderersDir = join(libraryDir, "renderers");

  return {
    async ensureLibrary(): Promise<void> {
      if (!existsSync(skillsDir)) await mkdir(skillsDir, { recursive: true });
      if (!existsSync(renderersDir)) await mkdir(renderersDir, { recursive: true });
    },

    // --- Skills ---

    async listSkills(): Promise<SkillMetadata[]> {
      const skills = await discoverProjectSkills(skillsDir);
      return [...skills.values()].map((s) => s.meta);
    },

    async getSkill(name: string): Promise<string | null> {
      assertSafePathSegment(name);
      const path = join(skillsDir, name, "SKILL.md");
      if (!existsSync(path)) return null;
      return readFile(path, "utf-8");
    },

    async createSkill(name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const dir = join(skillsDir, name);
      if (existsSync(dir)) throw new Error(`Skill already exists: ${name}`);
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "SKILL.md"), content);
    },

    async updateSkill(name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(skillsDir, name, "SKILL.md");
      if (!existsSync(path)) throw new Error(`Skill not found: ${name}`);
      await Bun.write(path, content);
    },

    async deleteSkill(name: string): Promise<void> {
      assertSafePathSegment(name);
      const dir = join(skillsDir, name);
      if (!existsSync(dir)) throw new Error(`Skill not found: ${name}`);
      await rm(dir, { recursive: true });
    },

    getSkillSourceDir(name: string): string {
      assertSafePathSegment(name);
      const dir = join(skillsDir, name);
      if (!existsSync(dir)) throw new Error(`Library skill not found: ${name}`);
      return dir;
    },

    // --- Renderers ---

    async listRenderers(): Promise<Array<{ name: string }>> {
      if (!existsSync(renderersDir)) return [];
      const entries = await readdir(renderersDir);
      return entries
        .filter((f) => f.endsWith(".ts"))
        .map((f) => ({ name: f.replace(/\.ts$/, "") }));
    },

    async getRenderer(name: string): Promise<string | null> {
      assertSafePathSegment(name);
      const path = join(renderersDir, `${name}.ts`);
      if (!existsSync(path)) return null;
      return readFile(path, "utf-8");
    },

    async createRenderer(name: string, source: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(renderersDir, `${name}.ts`);
      if (existsSync(path)) throw new Error(`Renderer already exists: ${name}`);
      await Bun.write(path, source);
    },

    async updateRenderer(name: string, source: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(renderersDir, `${name}.ts`);
      if (!existsSync(path)) throw new Error(`Renderer not found: ${name}`);
      await Bun.write(path, source);
    },

    async deleteRenderer(name: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(renderersDir, `${name}.ts`);
      if (!existsSync(path)) throw new Error(`Renderer not found: ${name}`);
      await rm(path);
    },
  };
}

export type LibraryRepo = ReturnType<typeof createLibraryRepo>;
