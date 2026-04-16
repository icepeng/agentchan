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

// System assets (renderer runtime source + type declarations) shipped to
// renderer authors. Source-first packages in dev; sidecar copies in exe.
const monorepoRoot = join(devWebUIRoot, "..", "..");
export const RENDERER_RUNTIME_ENTRY = isDev
  ? join(monorepoRoot, "packages/renderer-runtime/src/index.ts")
  : join(exeDir, "data/_system/renderer-runtime.ts");
export const RENDERER_TYPES_ENTRY = isDev
  ? join(monorepoRoot, "packages/renderer-types/src/index.ts")
  : join(exeDir, "data/_system/renderer-types.ts");

export const IMAGE_EXTS = ["webp", "png", "jpg", "jpeg", "gif", "svg", "avif"];

export async function probeCover(dir: string): Promise<string | null> {
  for (const ext of IMAGE_EXTS) {
    const file = Bun.file(join(dir, `COVER.${ext}`));
    if (await file.exists()) return `COVER.${ext}`;
  }
  return null;
}

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
