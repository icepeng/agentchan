import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

export function createProjectService(projectRepo: ProjectRepo, templateRepo: TemplateRepo, projectsDir: string) {
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
    async createFromTemplate(name: string, templateName: string) {
      const templateDir = templateRepo.getSourceDir(templateName);
      return projectRepo.createFromSource(name, templateDir);
    },
    async scanWorkspaceFiles(slug: string) {
      return projectRepo.scanWorkspaceFiles(slug);
    },

    async scanProjectTree(slug: string) {
      return projectRepo.scanProjectTree(slug);
    },

    async readProjectFile(slug: string, filePath: string) {
      return projectRepo.readProjectFile(slug, filePath);
    },

    async writeProjectFile(slug: string, filePath: string, content: string) {
      return projectRepo.writeProjectFile(slug, filePath, content);
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

    serveWorkspaceFile(slug: string, filePath: string): { fullPath: string } | null {
      return projectRepo.resolveProjectFile(slug, `files/${filePath}`);
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
