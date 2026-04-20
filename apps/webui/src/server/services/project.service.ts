import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";
import type { ProjectIntent } from "../types.js";

export function createProjectService(projectRepo: ProjectRepo, templateRepo: TemplateRepo, projectsDir: string) {
  const transpiler = new Bun.Transpiler({ loader: "ts" });

  return {
    async list() { return projectRepo.list(); },
    async getCoverFile(slug: string) { return projectRepo.getCoverFile(slug); },
    async get(slug: string) { return projectRepo.get(slug); },
    async create(name: string, opts?: { intent?: ProjectIntent }) { return projectRepo.create(name, opts); },
    async update(slug: string, updates: { name?: string; notes?: string }) {
      return projectRepo.update(slug, updates);
    },
    async delete(slug: string) { return projectRepo.delete(slug); },
    async duplicate(sourceSlug: string, name: string, opts?: { intent?: ProjectIntent }) {
      return projectRepo.duplicate(sourceSlug, name, opts);
    },
    async createFromTemplate(name: string, templateName: string, opts?: { intent?: ProjectIntent }) {
      const templateDir = templateRepo.getSourceDir(templateName);
      return projectRepo.createFromSource(name, templateDir, opts);
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

    async deleteProjectFile(slug: string, filePath: string) {
      return projectRepo.deleteProjectFile(slug, filePath);
    },

    async deleteProjectDir(slug: string, dirPath: string) {
      return projectRepo.deleteProjectDir(slug, dirPath);
    },

    async renameProjectEntry(slug: string, fromPath: string, toPath: string) {
      return projectRepo.renameProjectEntry(slug, fromPath, toPath);
    },

    async createProjectDir(slug: string, dirPath: string) {
      return projectRepo.createProjectDir(slug, dirPath);
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

    revealFileInExplorer(slug: string, filePath: string): void {
      const resolved = projectRepo.resolveProjectFile(slug, filePath);
      if (!resolved) throw new Error(`Invalid path: ${filePath}`);

      const { fullPath } = resolved;
      const cmd =
        process.platform === "win32"
          ? ["explorer", "/select,", fullPath]
          : process.platform === "darwin"
            ? ["open", "-R", fullPath]
            : ["xdg-open", dirname(fullPath)];
      Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
