import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import type { BunPlugin } from "bun";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { scanWorkspaceFiles } from "../workspace/scan.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer/ entrypoint by bundling it and checking the Renderer V1 contract.

Returns a success message with bundle details, or a detailed error message with the failure phase (entrypoint / build / export / theme).
Use this after writing or editing renderer/index.tsx to verify it works before asking the user to check.`;

const RENDERER_V1_IMPORT = "agentchan:renderer/v1";
const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

const RENDERER_RUNTIME_SOURCE = `
export const Agentchan = {
  fileUrl(snapshot, fileOrPath, options = {}) {
    const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.path;
    const encoded = String(path).replace(/^\\/+/, "").split("/").map(encodeURIComponent).join("/");
    const url = snapshot.baseUrl.replace(/\\/$/, "") + "/files/" + encoded;
    const digest = typeof fileOrPath === "string" ? options.digest : fileOrPath?.digest;
    return digest ? url + "?v=" + encodeURIComponent(digest) : url;
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

interface RendererSnapshot {
  slug: string;
  files: Awaited<ReturnType<typeof scanWorkspaceFiles>>;
  baseUrl: string;
  state: { messages: unknown[]; isStreaming: boolean; pendingToolCalls: readonly string[] };
}

export function createValidateRendererTool(
  projectDir: string,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(): Promise<AgentToolResult<void>> {
      const entrypoint = findEntrypoint(projectDir);
      if (entrypoint.error) return textResult(`Entrypoint error:\n${entrypoint.error}`);
      if (!entrypoint.path) {
        return textResult(
          "Entrypoint error:\nrenderer/index.tsx not found.",
        );
      }

      let js: string;
      let cssCount = 0;
      try {
        await validateImportPolicy(entrypoint.path, join(projectDir, "renderer"));
        const result = await Bun.build({
          entrypoints: [entrypoint.path],
          target: "browser",
          format: "esm",
          splitting: false,
          plugins: [rendererSourcePlugin(join(projectDir, "renderer")), rendererRuntimePlugin()],
        });
        if (!result.success) {
          const message = result.logs.map((log) => log.message).join("\n").trim();
          return textResult(`Build error:\n${message || "Renderer build failed."}`);
        }

        const jsOutputs: string[] = [];
        await Promise.all(result.outputs.map(async (output) => {
          if (output.type.startsWith("text/javascript")) {
            jsOutputs.push(await output.text());
          } else if (output.type === "text/css;charset=utf-8" || output.path.endsWith(".css")) {
            cssCount += 1;
          }
        }));
        if (jsOutputs.length !== 1) {
          return textResult("Build error:\nRenderer build did not produce one JavaScript entrypoint.");
        }
        js = jsOutputs[0] ?? "";
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const phase = e instanceof RendererPolicyError ? "Policy error" : "Build error";
        return textResult(`${phase}:\n${message}`);
      }

      const files = await scanWorkspaceFiles(join(projectDir, "files"));
      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, js);
      try {
        installValidationRuntime();
        const mod = await import(pathToFileURL(tmpPath).href) as { default?: unknown };

        if (!isRendererComponent(mod.default)) {
          return textResult(
            "Export error: default export must be a React component function.",
          );
        }

        const snapshot: RendererSnapshot = {
          slug: "_validate",
          files,
          baseUrl: "/api/projects/_validate",
          state: { messages: [], isStreaming: false, pendingToolCalls: [] },
        };
        const themeExport = (mod as { theme?: unknown }).theme;
        if (themeExport !== undefined && typeof themeExport !== "function") {
          return textResult("Export error: theme export must be a function when provided.");
        }
        if (typeof themeExport === "function") {
          const themeError = validateTheme(themeExport(snapshot));
          if (themeError) return textResult(`Theme error:\n${themeError}`);
        }

        return textResult(
          `OK - Renderer V1 contract is valid. JS bundle: ${js.length} chars. CSS artifacts: ${cssCount}. Files: ${files.length}.`,
        );
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return textResult(
          `Runtime error:\n${err.message}${err.stack ? "\n" + err.stack : ""}`,
        );
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
  };
}

const THEME_TOKEN_KEYS = new Set([
  "void",
  "base",
  "surface",
  "elevated",
  "accent",
  "fg",
  "fg2",
  "fg3",
  "edge",
]);

function validateTheme(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) return "theme(snapshot) must return an object or null.";
  if (!isPlainObject(raw.base)) return "theme.base must be an object.";

  const recognizedBase = Object.entries(raw.base).filter(
    ([key, value]) => THEME_TOKEN_KEYS.has(key) && typeof value === "string" && value.length > 0,
  );
  if (recognizedBase.length === 0) {
    return "theme.base must contain at least one recognized string token.";
  }

  if (raw.dark !== undefined && !isPlainObject(raw.dark)) {
    return "theme.dark must be an object when provided.";
  }
  if (
    raw.prefersScheme !== undefined &&
    raw.prefersScheme !== "light" &&
    raw.prefersScheme !== "dark"
  ) {
    return 'theme.prefersScheme must be "light" or "dark" when provided.';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findEntrypoint(projectDir: string): { path: string | null; error?: string } {
  const tsEntry = join(projectDir, "renderer", "index.ts");
  const tsxEntry = join(projectDir, "renderer", "index.tsx");
  const hasTs = existsSync(tsEntry);
  const hasTsx = existsSync(tsxEntry);
  if (hasTs) {
    return {
      path: null,
      error: "Renderer must use the React entrypoint renderer/index.tsx. renderer/index.ts is not supported.",
    };
  }
  return { path: hasTsx ? tsxEntry : null };
}

function isRendererComponent(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

class RendererPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererPolicyError";
  }
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
        throw new RendererPolicyError(`Renderer import is not allowed: ${specifier}`);
      }
      if (!specifier.startsWith(".")) {
        throw new RendererPolicyError(
          `Renderer bare import is not allowed: ${specifier}. Use ${RENDERER_V1_IMPORT}, react, or a relative renderer/ import.`,
        );
      }

      const importedPath = resolve(dirname(resolvedSource), specifier);
      if (!isInside(rendererRoot, importedPath)) {
        throw new RendererPolicyError(`Renderer relative import escapes renderer/: ${specifier}`);
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
      throw new RendererPolicyError(
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
        namespace: "agentchan-renderer",
      }));
      build.onResolve({ filter: /^react$/ }, (args) => ({
        path: args.path,
        namespace: "agentchan-renderer",
      }));
      build.onLoad({ filter: /.*/, namespace: "agentchan-renderer" }, (args) => ({
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
        if (!isInside(rendererRoot, resolve(args.path))) return undefined;
        const source = await readFile(args.path, "utf-8");
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

function installValidationRuntime(): void {
  (globalThis as typeof globalThis & {
    __AGENTCHAN_RENDERER_V1__?: unknown;
  }).__AGENTCHAN_RENDERER_V1__ = {
    React: {
      Fragment: Symbol.for("react.fragment"),
      createElement(type: unknown, props: unknown, ...children: unknown[]) {
        return { type, props: { ...(props as object), children } };
      },
      useState(initial: unknown) {
        return [typeof initial === "function" ? (initial as () => unknown)() : initial, () => {}];
      },
      useEffect() {},
      useLayoutEffect() {},
      useRef(value: unknown) {
        return { current: value };
      },
      useMemo(factory: () => unknown) {
        return factory();
      },
      useCallback(callback: unknown) {
        return callback;
      },
      useId() {
        return "_validate";
      },
    },
    createRoot() {
      return {
        render() {},
        unmount() {},
      };
    },
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
    },
    Fragment: Symbol.for("react.fragment"),
    jsx(type: unknown, props: unknown) {
      return { type, props };
    },
    jsxs(type: unknown, props: unknown) {
      return { type, props };
    },
    jsxDEV(type: unknown, props: unknown) {
      return { type, props };
    },
  };
}
