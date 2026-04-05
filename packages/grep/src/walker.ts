import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DEFAULT_MAX_FILE_SIZE, type WalkOptions } from "./types.js";

/** Directories to always skip during traversal */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".svn",
  ".hg",
  "__pycache__",
  ".DS_Store",
  ".turbo",
  ".next",
  ".nuxt",
  "dist",
  ".cache",
]);

/**
 * Walk a directory tree yielding file paths suitable for searching.
 *
 * Skips known directories, symlinks, and files exceeding maxFileSize.
 * Does NOT check for binary content — callers should handle that
 * after reading the file (avoids a double read).
 *
 * Yields paths relative to rootDir.
 */
export async function* walkFiles(
  rootDir: string,
  options?: WalkOptions,
): AsyncGenerator<string> {
  const absRoot = resolve(rootDir);
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  const globMatcher = options?.glob ? new Bun.Glob(options.glob) : null;

  const dirsToVisit: string[] = [""];

  while (dirsToVisit.length > 0) {
    const currentRelDir = dirsToVisit.pop()!;
    const currentAbsDir = currentRelDir
      ? join(absRoot, currentRelDir)
      : absRoot;

    let entries;
    try {
      entries = await readdir(currentAbsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relPath = currentRelDir
        ? currentRelDir + "/" + entry.name
        : entry.name;

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        dirsToVisit.push(relPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (globMatcher && !globMatcher.match(relPath)) continue;

      const absPath = join(absRoot, relPath);
      try {
        const file = Bun.file(absPath);
        if (file.size > maxFileSize || file.size === 0) continue;
      } catch {
        continue;
      }

      yield relPath;
    }
  }
}
