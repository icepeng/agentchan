import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";

export function createProjectService(projectRepo: ProjectRepo, projectsDir: string) {
  const transpiler = new Bun.Transpiler({ loader: "ts" });

  return {
    async list() { return projectRepo.list(); },
    async get(slug: string) { return projectRepo.get(slug); },
    async create(name: string) { return projectRepo.create(name); },
    async update(slug: string, updates: { name?: string; notes?: string }) {
      return projectRepo.update(slug, updates);
    },
    async delete(slug: string) {
      const projects = await projectRepo.list();
      if (projects.length <= 1) throw new Error("Cannot delete the last project");
      return projectRepo.delete(slug);
    },
    async duplicate(sourceSlug: string, name: string) { return projectRepo.duplicate(sourceSlug, name); },
    async scanWorkspaceFiles(slug: string) {
      return projectRepo.scanWorkspaceFiles(slug);
    },

    async getSystem(slug: string) { return projectRepo.getSystem(slug); },
    async saveSystem(slug: string, content: string) { return projectRepo.saveSystem(slug, content); },

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

    serveWorkspaceFile(slug: string, filePath: string): { fullPath: string } | null {
      const filesBase = resolve(projectsDir, slug, "files");
      const fullPath = resolve(filesBase, filePath);
      if (!fullPath.startsWith(filesBase + sep)) return null;
      return { fullPath };
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
