import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { RendererV1Error } from "./errors.js";

export const RENDERER_V1_IMPORT = "agentchan:renderer/v1";

const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

export async function validateRendererImportPolicy(
  entrypoint: string,
  rendererDir: string,
): Promise<void> {
  const rendererRoot = resolve(rendererDir);
  const visited = new Set<string>();

  async function visit(sourcePath: string): Promise<void> {
    const resolvedSource = resolve(sourcePath);
    if (visited.has(resolvedSource)) return;
    visited.add(resolvedSource);

    const source = await readFile(resolvedSource, "utf-8");
    for (const specifier of findImportSpecifiers(source)) {
      if (specifier === RENDERER_V1_IMPORT) continue;
      if (specifier === "react") continue;
      if (specifier.startsWith("http://") || specifier.startsWith("https://")) {
        throw new RendererV1Error("policy", `Renderer import is not allowed: ${specifier}`);
      }
      if (!specifier.startsWith(".")) {
        throw new RendererV1Error(
          "policy",
          `Renderer bare import is not allowed: ${specifier}. Use ${RENDERER_V1_IMPORT}, react, or a relative renderer/ import.`,
        );
      }

      const importedPath = resolve(dirname(resolvedSource), specifier);
      if (!isInside(rendererRoot, importedPath)) {
        throw new RendererV1Error(
          "policy",
          `Renderer relative import escapes renderer/: ${specifier}`,
        );
      }

      const target = await resolveImportPath(importedPath);
      if (!target) continue;
      if (target.endsWith(".css")) continue;
      await visit(target);
    }

    rejectHostLeaks(source, relative(rendererRoot, resolvedSource).replace(/\\/g, "/"));
  }

  await visit(entrypoint);
}

export function findImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

async function resolveImportPath(importedPath: string): Promise<string | null> {
  if (existsSync(importedPath)) {
    const index = await maybeDirectoryIndex(importedPath);
    return index ?? importedPath;
  }

  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = importedPath + ext;
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

async function maybeDirectoryIndex(path: string): Promise<string | null> {
  if (!isAbsolute(path)) return null;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    if (!entries.some((entry) => entry.isFile())) return null;
    for (const ext of SOURCE_EXTENSIONS.filter(Boolean)) {
      const candidate = join(path, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function rejectHostLeaks(source: string, displayPath: string): void {
  const denied = [
    "<script",
    "</script",
    "window.parent",
    "window.top",
    "document.body",
    "document.documentElement",
    "localStorage.",
    "sessionStorage.",
  ];
  for (const needle of denied) {
    if (source.includes(needle)) {
      throw new RendererV1Error(
        "policy",
        `Renderer ${displayPath} uses ${needle}, which is outside the V1 contract.`,
      );
    }
  }
}

export function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
