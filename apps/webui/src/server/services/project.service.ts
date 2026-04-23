import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ProjectRepo } from "../repositories/project.repo.js";
import type { TemplateRepo } from "../repositories/template.repo.js";

export interface RendererAssetResponse {
  body: string | ReadableStream<Uint8Array> | Uint8Array | null;
  mimeType: string;
  /** Absolute disk path — Bun.file() can stream it on the caller's terms. */
  fullPath?: string;
}

export interface ProjectFileCatalogEntry {
  type: "text" | "binary";
  path: string;
  modifiedAt: number;
  /** Present for text files only. */
  content?: string;
  frontmatter?: Record<string, unknown> | null;
}

/**
 * CSP directives the host always applies to renderer iframe responses. The
 * `allowedDomains` list from `_project.json` is folded into script/style/
 * img/font directives only — `connect-src` is hard-pinned to 'self' so no
 * matter what the manifest says, the renderer cannot exfiltrate data to an
 * external origin.
 */
export function buildCspHeader(allowedDomains: string[] = []): string {
  const extra = allowedDomains.length > 0 ? ` ${allowedDomains.join(" ")}` : "";
  return [
    `default-src 'self'${extra}`,
    `script-src 'self' 'unsafe-inline'${extra}`,
    `style-src 'self' 'unsafe-inline'${extra}`,
    `img-src 'self' data: blob:${extra}`,
    `font-src 'self' data:${extra}`,
    `connect-src 'self'`,
    `frame-ancestors 'self'`,
    `base-uri 'none'`,
    `object-src 'none'`,
  ].join("; ");
}

export function createProjectService(
  projectRepo: ProjectRepo,
  templateRepo: TemplateRepo,
  projectsDir: string,
) {
  const tsTranspiler = new Bun.Transpiler({ loader: "ts" });

  function projectDir(slug: string): string {
    return join(projectsDir, slug);
  }

  function rendererDir(slug: string): string {
    return join(projectDir(slug), "renderer");
  }

  /**
   * Maps an asset path under `renderer/` to an absolute disk path, rejecting
   * traversal attempts. An empty or trailing-slash path collapses to
   * `index.html`.
   */
  function safeRendererPath(slug: string, relPath: string): string | null {
    const root = resolve(rendererDir(slug));
    const normalized = relPath && relPath !== "/" ? relPath.replace(/^\/+/, "") : "index.html";
    const fullPath = resolve(root, normalized);
    if (fullPath !== root && !fullPath.startsWith(root + sep)) return null;
    return fullPath;
  }

  function mimeFromExt(ext: string): string {
    switch (ext) {
      case "html": return "text/html; charset=utf-8";
      case "js":
      case "mjs":
      case "ts":   return "text/javascript; charset=utf-8";
      case "json": return "application/json; charset=utf-8";
      case "css":  return "text/css; charset=utf-8";
      case "svg":  return "image/svg+xml";
      case "png":  return "image/png";
      case "jpg":
      case "jpeg": return "image/jpeg";
      case "webp": return "image/webp";
      case "gif":  return "image/gif";
      case "wasm": return "application/wasm";
      default:     return "application/octet-stream";
    }
  }

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
     * Reads a file under the project's `renderer/` folder. `.ts` is
     * type-stripped (preserving line numbers so DevTools maps back cleanly);
     * everything else is sent as raw bytes.
     *
     * ESM consumers write `.js` in import specifiers even when the file is
     * actually `.ts` on disk (esbuild convention). When the requested `.js`
     * file doesn't exist we fall back to the sibling `.ts` and transpile.
     */
    async loadRendererAsset(
      slug: string,
      relPath: string,
    ): Promise<RendererAssetResponse | null> {
      const fullPath = safeRendererPath(slug, relPath);
      if (!fullPath) return null;

      if (existsSync(fullPath)) {
        const ext = fullPath.split(".").pop()?.toLowerCase() ?? "";
        if (ext === "ts") {
          const source = await readFile(fullPath, "utf-8");
          const js = tsTranspiler.transformSync(source);
          return { body: js, mimeType: mimeFromExt("js"), fullPath };
        }
        return { body: null, mimeType: mimeFromExt(ext), fullPath };
      }

      if (fullPath.endsWith(".js")) {
        const tsPath = `${fullPath.slice(0, -3)}.ts`;
        if (existsSync(tsPath)) {
          const source = await readFile(tsPath, "utf-8");
          const js = tsTranspiler.transformSync(source);
          return { body: js, mimeType: mimeFromExt("js"), fullPath: tsPath };
        }
      }

      return null;
    },

    /**
     * Compact JSON catalog of every workspace file. Renderers consume this
     * on `streaming_clear` to refresh their view. Binary files are reported
     * by path only.
     */
    async listFilesCatalog(slug: string): Promise<ProjectFileCatalogEntry[]> {
      const files = await projectRepo.scanWorkspaceFiles(slug);
      return files.map((f) => {
        if (f.type === "binary") {
          return { type: "binary", path: f.path, modifiedAt: f.modifiedAt };
        }
        if (f.type === "data") {
          return {
            type: "text",
            path: f.path,
            modifiedAt: f.modifiedAt,
            content: f.content,
            frontmatter: null,
          };
        }
        return {
          type: "text",
          path: f.path,
          modifiedAt: f.modifiedAt,
          content: f.content,
          frontmatter: f.frontmatter,
        };
      });
    },

    buildCspHeader,

    async getAllowedDomains(slug: string): Promise<string[]> {
      const project = await projectRepo.get(slug);
      return project?.renderer?.allowedDomains ?? [];
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
