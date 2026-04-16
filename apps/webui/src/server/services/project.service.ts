import { dirname, join } from "node:path";
import { buildRenderer, createBundleCache } from "@agentchan/renderer-bundle";
import { RENDERER_RUNTIME_ENTRY } from "../paths.js";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

export function createProjectService(projectRepo: ProjectRepo, templateRepo: TemplateRepo, projectsDir: string) {
  const rendererCache = createBundleCache();

  return {
    async list() { return projectRepo.list(); },
    async getCoverFile(slug: string) { return projectRepo.getCoverFile(slug); },
    async get(slug: string) { return projectRepo.get(slug); },
    async create(name: string) { return projectRepo.create(name); },
    async update(slug: string, updates: { name?: string; notes?: string }) {
      return projectRepo.update(slug, updates);
    },
    async delete(slug: string) { return projectRepo.delete(slug); },
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
      rendererCache.invalidate(slug);
      return projectRepo.writeProjectFile(slug, filePath, content);
    },

    async deleteProjectFile(slug: string, filePath: string) {
      rendererCache.invalidate(slug);
      return projectRepo.deleteProjectFile(slug, filePath);
    },

    async deleteProjectDir(slug: string, dirPath: string) {
      rendererCache.invalidate(slug);
      return projectRepo.deleteProjectDir(slug, dirPath);
    },

    async renameProjectEntry(slug: string, fromPath: string, toPath: string) {
      rendererCache.invalidate(slug);
      return projectRepo.renameProjectEntry(slug, fromPath, toPath);
    },

    async createProjectDir(slug: string, dirPath: string) {
      rendererCache.invalidate(slug);
      return projectRepo.createProjectDir(slug, dirPath);
    },

    async transpileRenderer(slug: string): Promise<
      { js: string } | { error: string } | null
    > {
      const cached = rendererCache.get(slug);
      if (cached !== null) return { js: cached };

      const projectDir = join(projectsDir, slug);
      const result = await buildRenderer(projectDir, {
        runtimeEntry: RENDERER_RUNTIME_ENTRY,
      });
      if ("error" in result) {
        if (result.error === "renderer.ts not found") return null;
        return { error: result.error };
      }
      rendererCache.set(slug, result.js, result.sources);
      return { js: result.js };
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
