import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { BunPlugin } from "bun";

const RENDERER_V1_IMPORT = "agentchan:renderer/v1";
const VIRTUAL_NAMESPACE = "agentchan-renderer";

const RENDERER_RUNTIME_SOURCE = `
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

const REACT_RUNTIME_SOURCE = `
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

const RENDERER_JSX_RUNTIME_SOURCE = `
const runtime = globalThis.__AGENTCHAN_RENDERER_V1__;
if (!runtime) {
  throw new Error("Agentchan renderer JSX runtime is not installed.");
}
export const Fragment = runtime.Fragment;
export const jsx = runtime.jsx;
export const jsxs = runtime.jsxs;
export const jsxDEV = runtime.jsxDEV ?? runtime.jsx;
`;

const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

export interface RendererBundle {
  js: string;
  css: string[];
}

export class RendererBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererBuildError";
  }
}

export function findRendererEntrypoint(projectDir: string): string | null {
  const tsEntry = join(projectDir, "renderer", "index.ts");
  const tsxEntry = join(projectDir, "renderer", "index.tsx");
  const hasTs = existsSync(tsEntry);
  const hasTsx = existsSync(tsxEntry);

  if (hasTs) {
    throw new RendererBuildError(
      "Renderer must use the React entrypoint renderer/index.tsx. renderer/index.ts is not supported.",
    );
  }

  if (hasTsx) return tsxEntry;
  return null;
}

export async function buildRendererBundle(projectDir: string): Promise<RendererBundle | null> {
  const entrypoint = findRendererEntrypoint(projectDir);
  if (!entrypoint) return null;

  const rendererDir = join(projectDir, "renderer");
  await validateImportPolicy(entrypoint, rendererDir);

  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    plugins: [rendererSourcePlugin(rendererDir), rendererRuntimePlugin()],
  });

  if (!result.success) {
    const message = result.logs.map((log) => log.message).join("\n").trim();
    throw new RendererBuildError(message || "Renderer build failed.");
  }

  const js: string[] = [];
  const css: string[] = [];
  await Promise.all(result.outputs.map(async (output) => {
    if (output.type.startsWith("text/javascript")) {
      js.push(await output.text());
    } else if (output.type === "text/css;charset=utf-8" || output.path.endsWith(".css")) {
      css.push(await output.text());
    }
  }));

  if (js.length !== 1) {
    throw new RendererBuildError("Renderer build did not produce one JavaScript entrypoint.");
  }

  return { js: js[0] ?? "", css };
}

async function validateImportPolicy(entrypoint: string, rendererDir: string): Promise<void> {
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
        throw new RendererBuildError(`Renderer import is not allowed: ${specifier}`);
      }
      if (!specifier.startsWith(".")) {
        throw new RendererBuildError(
          `Renderer bare import is not allowed: ${specifier}. Use ${RENDERER_V1_IMPORT}, react, or a relative renderer/ import.`,
        );
      }

      const importedPath = resolve(dirname(resolvedSource), specifier);
      if (!isInside(rendererRoot, importedPath)) {
        throw new RendererBuildError(`Renderer relative import escapes renderer/: ${specifier}`);
      }

      const target = await resolveImportPath(importedPath);
      if (!target) continue;
      if (target.endsWith(".css")) continue;
      await visit(target);
    }

    rejectIframeHostLeaks(source, relative(rendererRoot, resolvedSource).replace(/\\/g, "/"));
  }

  await visit(entrypoint);
}

function findImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

async function resolveImportPath(importedPath: string): Promise<string | null> {
  if (existsSync(importedPath)) {
    const entries = await maybeDirectoryIndex(importedPath);
    return entries ?? importedPath;
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

function rejectIframeHostLeaks(source: string, displayPath: string): void {
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
      throw new RendererBuildError(
        `Renderer ${displayPath} uses ${needle}, which is outside the V1 contract.`,
      );
    }
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function rendererRuntimePlugin(): BunPlugin {
  return {
    name: "agentchan-renderer-v1",
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

function rendererSourcePlugin(rendererDir: string): BunPlugin {
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
