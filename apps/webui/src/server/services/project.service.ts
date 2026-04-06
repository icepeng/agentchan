import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";

export function createProjectService(projectRepo: ProjectRepo, projectsDir: string) {
  const transpiler = new Bun.Transpiler({ loader: "ts" });

  return {
    async list() { return projectRepo.list(); },
    async get(slug: string) { return projectRepo.get(slug); },
    async create(name: string) { return projectRepo.create(name); },
    async update(slug: string, updates: { name?: string; outputDir?: string; notes?: string }) {
      return projectRepo.update(slug, updates);
    },
    async delete(slug: string) {
      // Lightweight count: readdir + filter directories, no file reads
      const entries = await readdir(projectsDir, { withFileTypes: true });
      const count = entries.filter((e) => e.isDirectory()).length;
      if (count <= 1) throw new Error("Cannot delete the last project");
      return projectRepo.delete(slug);
    },
    async duplicate(sourceSlug: string, name: string) { return projectRepo.duplicate(sourceSlug, name); },
    async readOutputFiles(slug: string, outputDirName?: string) {
      return projectRepo.readOutputFiles(slug, outputDirName);
    },

    async ensureInitialProject(): Promise<void> {
      const projects = await projectRepo.list();
      if (projects.length > 0) return;
      await projectRepo.create("General");
    },

    async transpileRenderer(slug: string): Promise<string | null> {
      const rendererPath = join(projectsDir, slug, "renderer.ts");
      if (!existsSync(rendererPath)) return null;
      const source = await Bun.file(rendererPath).text();
      return transpiler.transformSync(source);
    },

    async readRendererSource(slug: string): Promise<string | null> {
      const rendererPath = join(projectsDir, slug, "renderer.ts");
      if (!existsSync(rendererPath)) return null;
      return Bun.file(rendererPath).text();
    },

    async writeRendererSource(slug: string, source: string): Promise<void> {
      const rendererPath = join(projectsDir, slug, "renderer.ts");
      await Bun.write(rendererPath, source);
    },

    resolveProjectFilePath(slug: string, filePath: string): string {
      return join(projectsDir, slug, filePath);
    },

    get projectsDir() { return projectsDir; },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
