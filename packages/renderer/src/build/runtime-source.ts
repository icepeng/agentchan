import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BunPlugin } from "bun";
import { isInside, RENDERER_CORE_IMPORT, RENDERER_REACT_IMPORT } from "./policy.ts";
import {
  experimentalRendererDepsEnabled,
  packageRootName,
  rendererRuntimeDir,
} from "./runtime-deps.ts";

const PACKAGE_SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RENDERER_CORE_PATH = resolve(PACKAGE_SRC_DIR, "core.ts");
const RENDERER_REACT_PATH = resolve(PACKAGE_SRC_DIR, "react.tsx");

const HOST_RUNTIME_PATH_CACHE = new Map<string, string | null>();
const TRANSFORMED_RUNTIME_SOURCE_CACHE = new Map<string, Promise<string>>();

const HOST_RUNTIME_SIDE_CARS: Record<string, string> = {
  react: join("react", "index.js"),
  "react-dom/client": join("react-dom", "client.js"),
  "react/jsx-runtime": join("react", "jsx-runtime.js"),
  "react/jsx-dev-runtime": join("react", "jsx-dev-runtime.js"),
  scheduler: join("scheduler", "index.js"),
};

export function createRendererRuntimePlugin(): BunPlugin {
  return {
    name: "agentchan-renderer",
    setup(build) {
      build.onResolve({ filter: /^@agentchan\/renderer\/(core|react)$/ }, (args) => {
        if (args.path === RENDERER_CORE_IMPORT) return { path: RENDERER_CORE_PATH };
        if (args.path === RENDERER_REACT_IMPORT) return { path: RENDERER_REACT_PATH };
        return undefined;
      });
      build.onResolve({ filter: /^[^./].*/ }, (args) => {
        const runtimePath = resolveRendererRuntimeDependency(args.path);
        if (runtimePath) return { path: runtimePath };
        const hostRuntimePath = resolveHostRuntimePath(args.path);
        if (hostRuntimePath) return { path: hostRuntimePath };
        return undefined;
      });
      build.onLoad({ filter: /node_modules[\\/](?:react|react-dom|scheduler)[\\/].*\.(?:js|cjs|mjs)$/ }, async (args) => {
        return {
          contents: await loadTransformedRuntimeSource(args.path),
          loader: "js",
        };
      });
    },
  };
}

function resolveHostRuntimePath(specifier: string): string | null {
  const cacheKey = `${rendererRuntimeDir()}\0${specifier}`;
  if (HOST_RUNTIME_PATH_CACHE.has(cacheKey)) {
    return HOST_RUNTIME_PATH_CACHE.get(cacheKey) ?? null;
  }

  let resolved: string | null;
  try {
    resolved = fileURLToPath(import.meta.resolve(specifier));
  } catch {
    const sideCar = HOST_RUNTIME_SIDE_CARS[specifier];
    resolved = sideCar ? join(rendererRuntimeDir(), "node_modules", sideCar) : null;
  }
  HOST_RUNTIME_PATH_CACHE.set(cacheKey, resolved);
  return resolved;
}

function resolveRendererRuntimeDependency(specifier: string): string | null {
  if (!experimentalRendererDepsEnabled()) return null;

  const rootName = packageRootName(specifier);
  if (!rootName) return null;

  try {
    return Bun.resolveSync(specifier, join(rendererRuntimeDir(), "package.json"));
  } catch {
    return null;
  }
}

function loadTransformedRuntimeSource(path: string): Promise<string> {
  const existing = TRANSFORMED_RUNTIME_SOURCE_CACHE.get(path);
  if (existing) return existing;
  const source = readFile(path, "utf-8").then((text) =>
    text
      .replace(/\bprocess\.env\.NODE_ENV\b/g, JSON.stringify("development"))
      .replace(/\bprocess\.env\b/g, "({ NODE_ENV: \"development\" })")
  );
  TRANSFORMED_RUNTIME_SOURCE_CACHE.set(path, source);
  return source;
}

export function createRendererSourcePlugin(rendererDir: string): BunPlugin {
  const rendererRoot = resolve(rendererDir);
  return {
    name: "agentchan-renderer-source",
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const sourcePath = resolve(args.path);
        if (!isInside(rendererRoot, sourcePath)) return undefined;
        const source = await readFile(sourcePath, "utf-8");
        const pragma = "/** @jsxImportSource react */";
        return {
          contents: source.includes("@jsxImportSource")
            ? source
            : `${pragma}\n${source}`,
          loader: "tsx",
        };
      });
    },
  };
}
