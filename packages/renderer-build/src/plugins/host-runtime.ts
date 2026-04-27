import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  experimentalRendererDepsEnabled,
  packageRootName,
  rendererRuntimeDir,
} from "../runtime-deps.js";

const HOST_RUNTIME_PATH_CACHE = new Map<string, string | null>();
const TRANSFORMED_RUNTIME_SOURCE_CACHE = new Map<string, Promise<string>>();

const HOST_RUNTIME_SIDE_CARS: Record<string, string> = {
  react: join("react", "index.js"),
  "react-dom/client": join("react-dom", "client.js"),
  "react/jsx-runtime": join("react", "jsx-runtime.js"),
  "react/jsx-dev-runtime": join("react", "jsx-dev-runtime.js"),
  scheduler: join("scheduler", "index.js"),
};

export function resolveHostRuntimePath(specifier: string): string | null {
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

export function resolveRendererRuntimeDependency(specifier: string): string | null {
  if (!experimentalRendererDepsEnabled()) return null;

  const rootName = packageRootName(specifier);
  if (!rootName) return null;

  try {
    return Bun.resolveSync(specifier, join(rendererRuntimeDir(), "package.json"));
  } catch {
    return null;
  }
}

export function loadTransformedRuntimeSource(path: string): Promise<string> {
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
