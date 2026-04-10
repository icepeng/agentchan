import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import type { ProjectFile, TextFile, BinaryFile } from "./types.js";

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml",
  ".csv", ".xml", ".html", ".css",
  ".js", ".ts", ".mjs", ".mts",
]);

function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Recursively scan a workspace directory and produce a `ProjectFile[]`.
 *
 * - Text files include `content` and, for `.md` files, parsed `frontmatter`.
 * - Binary files include only `path` and `modifiedAt`.
 * - Dotfiles/dotdirs are skipped.
 *
 * Paths are relative to `baseDir`, using forward slashes.
 */
export async function scanWorkspaceFiles(
  baseDir: string,
): Promise<ProjectFile[]> {
  if (!existsSync(baseDir)) return [];

  const files: ProjectFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (isHidden(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      try {
        const fileStat = await stat(fullPath);
        const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");

        if (isTextFile(fullPath)) {
          const raw = await readFile(fullPath, "utf-8");
          let content = raw;
          let frontmatter: Record<string, unknown> | null = null;

          if (extname(fullPath).toLowerCase() === ".md") {
            const parsed = parseFrontmatter(raw);
            frontmatter = parsed.frontmatter;
            if (frontmatter) content = parsed.body;
          }

          const file: TextFile = {
            type: "text",
            path: relativePath,
            content,
            frontmatter,
            modifiedAt: fileStat.mtimeMs,
          };
          files.push(file);
        } else {
          const file: BinaryFile = {
            type: "binary",
            path: relativePath,
            modifiedAt: fileStat.mtimeMs,
          };
          files.push(file);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(baseDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
