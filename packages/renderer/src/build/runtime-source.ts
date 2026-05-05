import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BunPlugin } from "bun";
import {
  EXTERNAL_VENDOR_SPECIFIERS,
  isInside,
  RENDERER_CORE_IMPORT,
  RENDERER_REACT_IMPORT,
} from "./policy.ts";

const PACKAGE_SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RENDERER_CORE_PATH = resolve(PACKAGE_SRC_DIR, "core.ts");
const RENDERER_REACT_PATH = resolve(PACKAGE_SRC_DIR, "react.tsx");

export function createRendererRuntimePlugin(): BunPlugin {
  return {
    name: "agentchan-renderer",
    setup(build) {
      build.onResolve({ filter: /^@agentchan\/renderer\/(core|react)$/ }, (args) => {
        if (args.path === RENDERER_CORE_IMPORT) return { path: RENDERER_CORE_PATH };
        if (args.path === RENDERER_REACT_IMPORT) return { path: RENDERER_REACT_PATH };
        return undefined;
      });
      build.onResolve({ filter: /.*/ }, (args) => {
        if (EXTERNAL_VENDOR_SPECIFIERS.has(args.path)) {
          return { path: args.path, external: true };
        }
        return undefined;
      });
    },
  };
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
