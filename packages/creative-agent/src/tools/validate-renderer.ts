import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { nanoid } from "nanoid";
import {
  buildRendererBundle,
  findRendererEntrypoint,
  RendererV1Error,
  validateRendererTheme,
} from "../renderer/index.js";
import { textResult } from "../tool-result.js";
import { scanWorkspaceFiles } from "../workspace/scan.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer/ entrypoint by bundling it and checking the Renderer V1 contract.

Returns a success message with bundle details, or a detailed error message with the failure phase (entrypoint / policy / build / export / runtime / theme).
Use this after writing or editing renderer/index.tsx to verify it works before asking the user to check.`;

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
      try {
        const entrypoint = findRendererEntrypoint(projectDir);
        if (!entrypoint) {
          return textResult("Entrypoint error:\nrenderer/index.tsx not found.");
        }
      } catch (e) {
        return textResult(formatRendererError(e));
      }

      let bundle: Awaited<ReturnType<typeof buildRendererBundle>>;
      try {
        bundle = await buildRendererBundle(projectDir);
      } catch (e) {
        return textResult(formatRendererError(e));
      }
      if (!bundle) {
        return textResult("Entrypoint error:\nrenderer/index.tsx not found.");
      }

      const files = await scanWorkspaceFiles(join(projectDir, "files"));
      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, bundle.js);

      try {
        installValidationRuntime();
        const mod = await import(pathToFileURL(tmpPath).href) as { default?: unknown; theme?: unknown };

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

        if (mod.theme !== undefined && typeof mod.theme !== "function") {
          return textResult("Export error: theme export must be a function when provided.");
        }

        const normalizedTheme =
          typeof mod.theme === "function"
            ? validateRendererTheme(mod.theme(snapshot))
            : null;
        const themeSummary = normalizedTheme
          ? ` Theme tokens: ${Object.keys(normalizedTheme.base).length}.`
          : "";

        return textResult(
          `OK - Renderer V1 contract is valid. JS bundle: ${bundle.js.length} chars. CSS artifacts: ${bundle.css.length}. Files: ${files.length}.${themeSummary}`,
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

function formatRendererError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof RendererV1Error) {
    return `${capitalize(e.phase)} error:\n${message}`;
  }
  return `Build error:\n${message}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isRendererComponent(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function installValidationRuntime(): void {
  const fragment = Symbol.for("react.fragment");
  const createElement = (type: unknown, props: unknown, ...children: unknown[]) => ({
    type,
    props: { ...(props as object), children },
  });
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const noop = () => {};
  const identity = <T>(value: T) => value;
  const React = {
    Children: {},
    Component: class {},
    Fragment: fragment,
    StrictMode: fragment,
    Suspense: fragment,
    cloneElement: identity,
    createContext(defaultValue: unknown) {
      return { Provider: fragment, Consumer: fragment, defaultValue };
    },
    createElement,
    createRef() {
      return { current: null };
    },
    forwardRef: identity,
    isValidElement(value: unknown) {
      return typeof value === "object" && value !== null && "type" in value;
    },
    lazy: identity,
    startTransition(callback: () => void) {
      callback();
    },
    use(value: unknown) {
      return value;
    },
    useActionState(_action: unknown, initialState: unknown) {
      return [initialState, noop, false];
    },
    useCallback: identity,
    useContext(context: { defaultValue?: unknown }) {
      return context.defaultValue;
    },
    useDebugValue: noop,
    useDeferredValue: identity,
    useEffect: noop,
    useId() {
      return "_validate";
    },
    useImperativeHandle: noop,
    useInsertionEffect: noop,
    useLayoutEffect: noop,
    useMemo(factory: () => unknown) {
      return factory();
    },
    useOptimistic(state: unknown) {
      return [state, noop];
    },
    useReducer(_reducer: unknown, initialArg: unknown) {
      return [initialArg, noop];
    },
    useRef(value: unknown) {
      return { current: value };
    },
    useState(initial: unknown) {
      return [typeof initial === "function" ? (initial as () => unknown)() : initial, noop];
    },
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
    },
    useTransition() {
      return [false, (callback: () => void) => callback()];
    },
  };

  (globalThis as typeof globalThis & {
    __AGENTCHAN_RENDERER_V1__?: unknown;
  }).__AGENTCHAN_RENDERER_V1__ = {
    React,
    Fragment: fragment,
    jsx,
    jsxs: jsx,
    jsxDEV: jsx,
  };
}
