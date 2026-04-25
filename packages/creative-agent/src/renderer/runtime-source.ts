import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";
import { isInside, RENDERER_V1_IMPORT } from "./policy.js";

const VIRTUAL_NAMESPACE = "agentchan-renderer";

export const RENDERER_RUNTIME_SOURCE = `
function normalizePath(path) {
  return String(path).replace(/^\\/+/, "");
}

function encodeFilePath(path) {
  return normalizePath(path).split("/").map(encodeURIComponent).join("/");
}

export const Agentchan = {
  fileUrl(snapshot, fileOrPath, options = {}) {
    const path =
      typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
    if (!path) {
      throw new Error("Agentchan.fileUrl requires a file path");
    }
    let url = snapshot.baseUrl.replace(/\\/$/, "") + "/files/" + encodeFilePath(path);
    const digest =
      typeof fileOrPath === "string" ? options.digest : fileOrPath?.digest;
    if (digest) url += "?v=" + encodeURIComponent(digest);
    return url;
  },
};

export default Agentchan;
`;

export const REACT_RUNTIME_SOURCE = `
const runtime = globalThis.__AGENTCHAN_RENDERER_V1__;
if (!runtime) {
  throw new Error("Agentchan renderer React runtime is not installed.");
}
const React = runtime.React;
export const Children = React.Children;
export const Component = React.Component;
export const Fragment = React.Fragment;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const startTransition = React.startTransition;
export const use = React.use;
export const useActionState = React.useActionState;
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useDebugValue = React.useDebugValue;
export const useDeferredValue = React.useDeferredValue;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useInsertionEffect = React.useInsertionEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useOptimistic = React.useOptimistic;
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;
export default React;
`;

export const RENDERER_JSX_RUNTIME_SOURCE = `
const runtime = globalThis.__AGENTCHAN_RENDERER_V1__;
if (!runtime) {
  throw new Error("Agentchan renderer JSX runtime is not installed.");
}
export const Fragment = runtime.Fragment;
export const jsx = runtime.jsx;
export const jsxs = runtime.jsxs;
export const jsxDEV = runtime.jsxDEV ?? runtime.jsx;
`;

export function createRendererRuntimePlugin(): BunPlugin {
  return {
    name: "agentchan-renderer",
    setup(build) {
      build.onResolve({ filter: /^agentchan:renderer\/v1(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, (args) => ({
        path: args.path,
        namespace: VIRTUAL_NAMESPACE,
      }));
      build.onResolve({ filter: /^react$/ }, (args) => ({
        path: args.path,
        namespace: VIRTUAL_NAMESPACE,
      }));
      build.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, (args) => ({
        contents: args.path === RENDERER_V1_IMPORT
          ? RENDERER_RUNTIME_SOURCE
          : args.path === "react"
            ? REACT_RUNTIME_SOURCE
            : RENDERER_JSX_RUNTIME_SOURCE,
        loader: "js",
      }));
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
        const pragma = "/** @jsxImportSource agentchan:renderer/v1 */";
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
