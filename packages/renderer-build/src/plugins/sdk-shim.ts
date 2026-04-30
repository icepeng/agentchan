import type { BunPlugin } from "bun";
import { RENDERER_CORE_IMPORT, RENDERER_REACT_IMPORT } from "../policy.js";
import {
  loadTransformedRuntimeSource,
  resolveHostRuntimePath,
  resolveRendererRuntimeDependency,
} from "./host-runtime.js";

const SDK_NAMESPACE = "agentchan-renderer-sdk";

// Mirrors packages/renderer/src/core.ts. Keep builder equivalence tests in sync
// when changing this shim.
const RENDERER_CORE_SOURCE = `
export function defineRenderer(factory, options = {}) {
  return {
    mount(container, bridge) {
      return factory({
        container,
        snapshot: bridge.snapshot,
        actions: bridge.actions,
      });
    },
    theme: options.theme,
  };
}

export function isRendererRuntime(value) {
  if (typeof value !== "object" || value === null) return false;
  return typeof value.mount === "function" &&
    (value.theme === undefined || typeof value.theme === "function");
}

export function fileUrl(snapshot, fileOrPath, options = {}) {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
  if (!path) {
    throw new Error("fileUrl requires a file path");
  }

  let url = snapshot.baseUrl.replace(/\\/$/, "") + "/files/" + encodeFilePath(path);
  const digest = typeof fileOrPath === "string" ? options.digest : fileOrPath?.digest;
  if (digest) url += "?v=" + encodeURIComponent(digest);
  return url;
}

function encodeFilePath(path) {
  return normalizePath(path).split("/").map(encodeURIComponent).join("/");
}

function normalizePath(path) {
  return String(path).replace(/^\\/+/, "");
}
`;

// Mirrors packages/renderer/src/react.tsx. Keep builder equivalence tests in sync
// when changing this shim.
const RENDERER_REACT_SOURCE = `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { defineRenderer, fileUrl, isRendererRuntime } from "@agentchan/renderer/core";

export { defineRenderer, fileUrl, isRendererRuntime };

export function createRenderer(Component, options = {}) {
  return {
    mount(container, bridge) {
      let currentSnapshot = bridge.snapshot;
      const root = createRoot(container);

      function render() {
        root.render(createElement(Component, {
          snapshot: currentSnapshot,
          actions: bridge.actions,
        }));
      }

      render();

      return {
        update(snapshot) {
          currentSnapshot = snapshot;
          render();
        },
        unmount() {
          root.unmount();
        },
      };
    },
    theme: options.theme,
  };
}
`;

const SDK_SOURCES: Record<string, { path: string; source: string; loader: "ts" | "tsx" }> = {
  [RENDERER_CORE_IMPORT]: {
    path: "core.ts",
    source: RENDERER_CORE_SOURCE,
    loader: "ts",
  },
  [RENDERER_REACT_IMPORT]: {
    path: "react.tsx",
    source: RENDERER_REACT_SOURCE,
    loader: "tsx",
  },
};

export function createRendererRuntimePlugin(): BunPlugin {
  return {
    name: "agentchan-renderer",
    setup(build) {
      build.onResolve({ filter: /^@agentchan\/renderer\/(core|react)$/ }, (args) => ({
        path: SDK_SOURCES[args.path]?.path ?? args.path,
        namespace: SDK_NAMESPACE,
      }));
      build.onResolve({ filter: /^\.\/core(?:\.ts)?$/, namespace: SDK_NAMESPACE }, () => ({
        path: SDK_SOURCES[RENDERER_CORE_IMPORT]!.path,
        namespace: SDK_NAMESPACE,
      }));
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
      build.onLoad({ filter: /\.(ts|tsx)$/, namespace: SDK_NAMESPACE }, (args) => {
        const source = Object.values(SDK_SOURCES).find((item) => item.path === args.path);
        if (!source) return undefined;
        return {
          contents: source.source,
          loader: source.loader,
        };
      });
    },
  };
}
