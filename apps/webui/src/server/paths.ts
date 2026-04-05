import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

// Dev mode: import.meta.dir = src/server/ (this file's source directory)
// Compiled mode: import.meta.dir is a virtual path (B:\~BUN\root), NOT the exe directory.
//   Use dirname(process.execPath) to get the actual exe location on disk.
const devWebUIRoot = join(import.meta.dir, "../..");
export const isDev = existsSync(join(devWebUIRoot, "vite.config.ts"));
const exeDir = dirname(process.execPath);

export const CLIENT_DIR = isDev
  ? join(devWebUIRoot, "dist/client")
  : join(exeDir, "public");

export const DATA_DIR = isDev
  ? join(devWebUIRoot, "data")
  : join(exeDir, "data");

export const PROJECTS_DIR = join(DATA_DIR, "projects");

export const LIBRARY_DIR = join(DATA_DIR, "library");

export function assertSafePathSegment(segment: string): void {
  if (
    !segment ||
    segment.includes("..") ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  ) {
    throw new Error(`Invalid path segment: ${segment}`);
  }
}
