import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { RendererV1Error } from "./errors.ts";
import {
  experimentalRendererDepsEnabled,
  packageRootName,
  rendererRuntimeDir,
} from "./runtime-deps.ts";

export const RENDERER_CORE_IMPORT = "@agentchan/renderer/core";
export const RENDERER_REACT_IMPORT = "@agentchan/renderer/react";

const ALLOWED_BARE_IMPORTS = new Set([
  RENDERER_CORE_IMPORT,
  RENDERER_REACT_IMPORT,
  "react",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

export async function validateRendererImportPolicy(
  entrypoint: string,
  rendererDir: string,
): Promise<void> {
  const rendererRoot = resolve(rendererDir);
  const visited = new Set<string>();
  const runtimeDeps = await readExperimentalRendererDependencies();

  async function visit(sourcePath: string): Promise<void> {
    const resolvedSource = resolve(sourcePath);
    if (visited.has(resolvedSource)) return;
    visited.add(resolvedSource);

    const source = await readFile(resolvedSource, "utf-8");
    for (const specifier of findImportSpecifiers(source)) {
      if (ALLOWED_BARE_IMPORTS.has(specifier)) continue;
      if (isRendererRuntimeDependency(specifier, runtimeDeps)) continue;
      if (specifier.startsWith("http://") || specifier.startsWith("https://")) {
        throw new RendererV1Error("policy", `Renderer import is not allowed: ${specifier}`);
      }
      if (!specifier.startsWith(".")) {
        throw new RendererV1Error(
          "policy",
          `Renderer bare import is not allowed: ${specifier}. Use @agentchan/renderer/core, @agentchan/renderer/react, react, react-dom/client, or a relative renderer/ import.`,
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

interface ExperimentalRendererDependencies {
  manifestDir: string;
  dependencies: Set<string>;
}

function isRendererRuntimeDependency(
  specifier: string,
  runtimeDeps: ExperimentalRendererDependencies | null,
): boolean {
  if (!runtimeDeps) return false;
  if (specifier.startsWith(".") || specifier.startsWith("node:")) return false;
  const rootName = packageRootName(specifier);
  if (!rootName) return false;
  if (!runtimeDeps.dependencies.has(rootName)) return false;

  const installPath = join(runtimeDeps.manifestDir, "node_modules", rootName);
  if (!existsSync(installPath)) {
    throw new RendererV1Error(
      "policy",
      `Experimental renderer dependency is declared but not installed: ${rootName}. Run bun install in AGENTCHAN_RENDERER_RUNTIME_DIR.`,
    );
  }

  return true;
}

async function readExperimentalRendererDependencies(): Promise<ExperimentalRendererDependencies | null> {
  if (!experimentalRendererDepsEnabled()) return null;
  const manifestDir = rendererRuntimeDir();
  try {
    const manifest = JSON.parse(await readFile(join(manifestDir, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
    };
    return {
      manifestDir,
      dependencies: new Set(Object.keys(manifest.dependencies ?? {})),
    };
  } catch {
    return null;
  }
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
