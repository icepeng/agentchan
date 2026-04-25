import { dirname, join } from "node:path";
import { buildRendererBundle } from "@agentchan/creative-agent";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";
import { TrustRequiredError, type TemplateTrustService } from "./template-trust.service.js";

export function createProjectService(
  projectRepo: ProjectRepo,
  templateRepo: TemplateRepo,
  trustService: TemplateTrustService,
  projectsDir: string,
) {
  return {
    async list() { return projectRepo.list(); },
    async getCoverFile(slug: string) { return projectRepo.getCoverFile(slug); },
    async get(slug: string) { return projectRepo.get(slug); },
    exists(slug: string) { return projectRepo.exists(slug); },
    async create(name: string) { return projectRepo.create(name); },
    async update(slug: string, updates: { name?: string; notes?: string }) {
      if (!projectRepo.exists(slug)) return null;
      return projectRepo.update(slug, updates);
    },
    async delete(slug: string) {
      if (!projectRepo.exists(slug)) return false;
      await projectRepo.delete(slug);
      return true;
    },
    async duplicate(sourceSlug: string, name: string) { return projectRepo.duplicate(sourceSlug, name); },
    async createFromTemplate(name: string, templateName: string) {
      if (!trustService.isTrusted(templateName)) {
        throw new TrustRequiredError(templateName);
      }
      const templateDir = templateRepo.getSourceDir(templateName);
      return projectRepo.createFromSource(name, templateDir);
    },
    async scanWorkspaceFiles(slug: string) {
      if (!projectRepo.exists(slug)) return null;
      return projectRepo.scanWorkspaceFiles(slug);
    },

    async scanProjectTree(slug: string) {
      if (!projectRepo.exists(slug)) return null;
      return projectRepo.scanProjectTree(slug);
    },

    async getReadme(slug: string) {
      if (!projectRepo.exists(slug)) return null;
      return (await projectRepo.readProjectFile(slug, "README.md")) ?? "";
    },

    async readProjectFile(slug: string, filePath: string) {
      return projectRepo.readProjectFile(slug, filePath);
    },

    async writeProjectFile(slug: string, filePath: string, content: string) {
      if (!projectRepo.exists(slug)) return false;
      return projectRepo.writeProjectFile(slug, filePath, content);
    },

    async deleteProjectFile(slug: string, filePath: string) {
      if (!projectRepo.exists(slug)) return false;
      await projectRepo.deleteProjectFile(slug, filePath);
      return true;
    },

    async deleteProjectDir(slug: string, dirPath: string) {
      if (!projectRepo.exists(slug)) return false;
      await projectRepo.deleteProjectDir(slug, dirPath);
      return true;
    },

    async renameProjectEntry(slug: string, fromPath: string, toPath: string) {
      if (!projectRepo.exists(slug)) return false;
      await projectRepo.renameProjectEntry(slug, fromPath, toPath);
      return true;
    },

    async createProjectDir(slug: string, dirPath: string) {
      if (!projectRepo.exists(slug)) return false;
      await projectRepo.createProjectDir(slug, dirPath);
      return true;
    },

    async buildRenderer(slug: string) {
      return buildRendererBundle(join(projectsDir, slug));
    },

    async serveWorkspaceFile(slug: string, filePath: string) {
      return projectRepo.getWorkspaceFile(slug, filePath);
    },

    revealFileInExplorer(slug: string, filePath: string): boolean {
      if (!projectRepo.exists(slug)) return false;
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
      return true;
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
