import { dirname, resolve, sep } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

/**
 * renderer/ 폴더 **안**의 파일로 scope를 좁혀 경로 탐색(`..`, absolute)을 차단한다.
 * resolve 후 문자열 prefix 체크가 Node.js에서 가장 안전한 방법.
 */
function safeRendererPath(projectsDir: string, slug: string, relPath: string): string | null {
  const rendererRoot = resolve(projectsDir, slug, "renderer");
  const abs = resolve(rendererRoot, relPath);
  if (abs !== rendererRoot && !abs.startsWith(rendererRoot + sep)) return null;
  return abs;
}

export function createProjectService(projectRepo: ProjectRepo, templateRepo: TemplateRepo, projectsDir: string) {
  const transpiler = new Bun.Transpiler({ loader: "ts" });

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

    /**
     * `.ts`만 허용. renderer 폴더 밖 경로나 파일 부재 시 null.
     */
    async transpileRenderer(slug: string, relPath: string = "index.ts"): Promise<string | null> {
      if (!relPath.endsWith(".ts")) return null;
      const absPath = safeRendererPath(projectsDir, slug, relPath);
      if (!absPath) return null;
      try {
        const source = await Bun.file(absPath).text();
        return transpiler.transformSync(source);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    /** raw 정적 에셋(css, pre-bundled js)의 디스크 경로를 돌려준다. */
    resolveRendererAsset(slug: string, relPath: string): { fullPath: string } | null {
      const absPath = safeRendererPath(projectsDir, slug, relPath);
      if (!absPath) return null;
      return { fullPath: absPath };
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
