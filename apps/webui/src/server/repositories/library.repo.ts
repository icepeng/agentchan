import { readFile, readdir, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverProjectSkills, type SkillMetadata } from "@agentchan/creative-agent";
import { assertSafePathSegment } from "../paths.js";

function createFlatFileCrud(dir: string, ext: string, label: string) {
  return {
    async list(): Promise<Array<{ name: string }>> {
      if (!existsSync(dir)) return [];
      const entries = await readdir(dir);
      const suffix = `.${ext}`;
      return entries
        .filter((f) => f.endsWith(suffix))
        .map((f) => ({ name: f.slice(0, -suffix.length) }));
    },

    async get(name: string): Promise<string | null> {
      assertSafePathSegment(name);
      const path = join(dir, `${name}.${ext}`);
      if (!existsSync(path)) return null;
      return readFile(path, "utf-8");
    },

    async create(name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(dir, `${name}.${ext}`);
      if (existsSync(path)) throw new Error(`${label} already exists: ${name}`);
      await Bun.write(path, content);
    },

    async update(name: string, content: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(dir, `${name}.${ext}`);
      if (!existsSync(path)) throw new Error(`${label} not found: ${name}`);
      await Bun.write(path, content);
    },

    async delete(name: string): Promise<void> {
      assertSafePathSegment(name);
      const path = join(dir, `${name}.${ext}`);
      if (!existsSync(path)) throw new Error(`${label} not found: ${name}`);
      await rm(path);
    },
  };
}

export function createLibraryRepo(libraryDir: string) {
  const skillsDir = join(libraryDir, "skills");
  const renderersDir = join(libraryDir, "renderers");
  const systemsDir = join(libraryDir, "systems");

  const renderers = createFlatFileCrud(renderersDir, "ts", "Renderer");
  const systems = createFlatFileCrud(systemsDir, "md", "System template");

  return {
    async ensureLibrary(): Promise<void> {
      await Promise.all([
        mkdir(skillsDir, { recursive: true }),
        mkdir(renderersDir, { recursive: true }),
        mkdir(systemsDir, { recursive: true }),
      ]);
    },

    // --- Skills (subdirectory-based, not flat file) ---

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

    // --- Renderers (flat file .ts) ---

    listRenderers: renderers.list,
    getRenderer: renderers.get,
    createRenderer: renderers.create,
    updateRenderer: renderers.update,
    deleteRenderer: renderers.delete,

    // --- Systems (flat file .md) ---

    listSystems: systems.list,
    getSystem: systems.get,
    createSystem: systems.create,
    updateSystem: systems.update,
    deleteSystem: systems.delete,
  };
}

export type LibraryRepo = ReturnType<typeof createLibraryRepo>;
