import { readFile, rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSafePathSegment } from "../paths.js";

export function createProjectSkillRepo(projectsDir: string) {
  return {
    async get(projectSlug: string, name: string): Promise<string | null> {
      assertSafePathSegment(name);
      const path = join(projectsDir, projectSlug, "skills", name, "SKILL.md");
      if (!existsSync(path)) return null;
      return readFile(path, "utf-8");
    },

    async create(projectSlug: string, name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const dir = join(projectsDir, projectSlug, "skills", name);
      if (existsSync(dir)) throw new Error(`Skill already exists in project: ${name}`);
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "SKILL.md"), content);
    },

    async update(projectSlug: string, name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(projectsDir, projectSlug, "skills", name, "SKILL.md");
      if (!existsSync(path)) throw new Error(`Skill not found in project: ${name}`);
      await Bun.write(path, content);
    },

    async delete(projectSlug: string, name: string): Promise<void> {
      assertSafePathSegment(name);
      const dir = join(projectsDir, projectSlug, "skills", name);
      if (!existsSync(dir)) throw new Error(`Skill not found in project: ${name}`);
      await rm(dir, { recursive: true });
    },

    async copyFrom(srcDir: string, projectSlug: string, name: string): Promise<void> {
      const dest = join(projectsDir, projectSlug, "skills", name);
      if (existsSync(dest)) throw new Error(`Skill already exists in project: ${name}`);
      await mkdir(join(projectsDir, projectSlug, "skills"), { recursive: true });
      await cp(srcDir, dest, { recursive: true });
    },
  };
}

export type ProjectSkillRepo = ReturnType<typeof createProjectSkillRepo>;
