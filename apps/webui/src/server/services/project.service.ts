import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

// Blob URL imports in the browser can't resolve "react", so we rewrite value
// imports to destructure from the `__rendererReact` global that the host
// publishes via `jsxRuntimeBridge.ts`. Type imports are already erased by
// the transpiler, so only value imports survive to this point.
function rewriteReactImports(js: string): string {
  return js.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']react["'];?/g,
    (_, names: string) => `const {${names}} = globalThis.__rendererReact;`,
  );
}

export function createProjectService(projectRepo: ProjectRepo, templateRepo: TemplateRepo, projectsDir: string) {
  // Classic-mode JSX transform targeting a globally-exposed factory. The
  // compiled module is imported via a Blob URL, so it cannot resolve the
  // automatic-runtime `react/jsx-runtime` import — instead the host binds
  // `globalThis.__rendererJsx = { h: React.createElement, Fragment: React.Fragment }`.
  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: {
      compilerOptions: {
        jsx: "react",
        jsxFactory: "__rendererJsx.h",
        jsxFragmentFactory: "__rendererJsx.Fragment",
      },
    },
  });

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

    async transpileRenderer(slug: string): Promise<string | null> {
      const rendererPath = join(projectsDir, slug, "renderer.tsx");
      if (!existsSync(rendererPath)) return null;
      const source = await Bun.file(rendererPath).text();
      const js = transpiler.transformSync(source);
      return rewriteReactImports(js);
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
