import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { parseFrontmatter } from "./frontmatter.js";
import type { ProjectFile } from "./types.js";

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt",
  ".csv", ".xml", ".html", ".css",
  ".js", ".ts", ".mjs", ".mts",
]);

const DATA_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);

function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isDataFile(filePath: string): boolean {
  return DATA_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function digestContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Recursively scan a workspace directory and produce a `ProjectFile[]`.
 *
 * - Text files (`.md`, `.txt`, source code, etc.) include `content` and, for
 *   `.md` files, parsed `frontmatter`.
 * - Data files (`.yaml`, `.yml`, `.json`) include both `content` (original)
 *   and `data` (parsed object). Parse failures fall back to `TextFile`.
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
    await Promise.all(entries.map(async (entry) => {
      if (isHidden(entry.name)) return;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        return;
      }

      try {
        const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");
        const ext = extname(fullPath).toLowerCase();

        if (isDataFile(fullPath)) {
          const [raw, fileStat] = await Promise.all([
            readFile(fullPath, "utf-8"),
            stat(fullPath),
          ]);
          const format: "yaml" | "json" = ext === ".json" ? "json" : "yaml";
          const parsed = tryParseData(raw, format);

          if (parsed.ok) {
            files.push({
              type: "data",
              path: relativePath,
              content: raw,
              data: parsed.value,
              format,
              modifiedAt: fileStat.mtimeMs,
              digest: digestContent(raw),
            });
          } else {
            // Parse failure — fall back to TextFile so callers still see content
            files.push({
              type: "text",
              path: relativePath,
              content: raw,
              frontmatter: null,
              modifiedAt: fileStat.mtimeMs,
              digest: digestContent(raw),
            });
          }
        } else if (isTextFile(fullPath)) {
          const [raw, fileStat] = await Promise.all([
            readFile(fullPath, "utf-8"),
            stat(fullPath),
          ]);
          let content = raw;
          let frontmatter: Record<string, unknown> | null = null;

          if (ext === ".md") {
            const parsed = parseFrontmatter(raw);
            frontmatter = parsed.frontmatter;
            if (frontmatter) content = parsed.body;
          }

          files.push({
            type: "text",
            path: relativePath,
            content,
            frontmatter,
            modifiedAt: fileStat.mtimeMs,
            digest: digestContent(raw),
          });
        } else {
          const [bytes, fileStat] = await Promise.all([
            readFile(fullPath),
            stat(fullPath),
          ]);
          files.push({
            type: "binary",
            path: relativePath,
            modifiedAt: fileStat.mtimeMs,
            digest: digestContent(bytes),
          });
        }
      } catch {
        // Skip unreadable files
      }
    }));
  }

  await walk(baseDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function tryParseData(
  raw: string,
  format: "yaml" | "json",
): { ok: true; value: unknown } | { ok: false } {
  try {
    const value = format === "json" ? JSON.parse(raw) : parseYaml(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}
