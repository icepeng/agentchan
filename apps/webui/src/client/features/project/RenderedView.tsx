import * as React from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { jsxDEV } from "react/jsx-dev-runtime";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import {
  useRendererOutput,
  useRendererViewState,
  useRendererViewDispatch,
  useRendererCommandDispatch,
  validateTheme,
} from "@/client/entities/renderer/index.js";
import type {
  RendererActions,
  RendererProps,
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

type RendererComponent = React.ComponentType<RendererProps>;

interface RendererModule {
  default: RendererComponent;
  theme?: (snapshot: RendererSnapshot) => RendererTheme | null;
}

interface RendererShellProps {
  Component: RendererComponent;
  actions: RendererActions;
  getSnapshot: () => RendererSnapshot;
  subscribe: (listener: () => void) => () => void;
}

function installRendererRuntime(): void {
  (globalThis as typeof globalThis & {
    __AGENTCHAN_RENDERER_V1__?: unknown;
  }).__AGENTCHAN_RENDERER_V1__ = {
    React,
    createRoot,
    useSyncExternalStore,
    Fragment,
    jsx,
    jsxs,
    jsxDEV,
  };
}

function RendererShell({
  Component,
  actions,
  getSnapshot,
  subscribe,
}: RendererShellProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <Component snapshot={snapshot} actions={actions} />;
}

function isRendererComponent(value: unknown): value is RendererComponent {
  return typeof value === "function";
}

function isThemeFunction(
  value: unknown,
): value is (snapshot: RendererSnapshot) => RendererTheme | null {
  return value === undefined || typeof value === "function";
}

function importRendererModule(js: string): Promise<RendererModule> {
  const blob = new Blob([js], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  return import(/* @vite-ignore */ url)
    .then((mod: { default?: unknown; theme?: unknown }) => {
      if (!isRendererComponent(mod.default)) {
        throw new Error(
          "Renderer default export must be a React component function.",
        );
      }
      if (!isThemeFunction(mod.theme)) {
        throw new Error("Renderer theme export must be a function when provided.");
      }
      return { default: mod.default, theme: mod.theme };
    })
    .finally(() => URL.revokeObjectURL(url));
}

function clearShadowRoot(root: ShadowRoot): void {
  while (root.firstChild) root.firstChild.remove();
}

function injectCss(root: ShadowRoot, css: readonly string[]): void {
  for (const text of css) {
    const style = document.createElement("style");
    style.textContent = text;
    root.append(style);
  }
}

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh, refreshState } = useRendererOutput();
  const commandDispatch = useRendererCommandDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostElementRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const snapshotRef = useRef<RendererSnapshot | null>(rendererView.snapshot);
  const listenersRef = useRef(new Set<() => void>());
  const moduleRef = useRef<RendererModule | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const hostElement = hostElementRef.current;
    if (!hostElement || shadowRootRef.current) return;
    shadowRootRef.current = hostElement.attachShadow({ mode: "open" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [project.activeProjectSlug, refresh]);

  useEffect(() => {
    const handleFilesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (detail?.slug === project.activeProjectSlug) {
        void refresh();
      }
    };
    window.addEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
    return () => window.removeEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
  }, [project.activeProjectSlug, refresh]);

  useEffect(() => {
    if (!state.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [state.isStreaming, project.activeProjectSlug, refresh]);

  useEffect(() => {
    if (!state.isStreaming) return;
    let raf = 0;
    let lastState = stateRef.current;
    refreshState();
    const tick = () => {
      if (stateRef.current !== lastState) {
        lastState = stateRef.current;
        refreshState();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isStreaming, refreshState]);

  useEffect(() => {
    const snapshot = rendererView.snapshot;
    snapshotRef.current = snapshot;
    for (const listener of listenersRef.current) listener();

    const mod = moduleRef.current;
    if (!mod || !snapshot) return;
    try {
      rendererViewDispatch({
        type: "SET_THEME",
        theme: validateTheme(mod.theme?.(snapshot) ?? null),
      });
    } catch (error) {
      console.warn("[renderer.theme] theme function threw", error);
      rendererViewDispatch({ type: "SET_THEME", theme: null });
    }
  }, [rendererView.snapshot, rendererViewDispatch]);

  useEffect(() => {
    const root = shadowRootRef.current;
    const bundle = rendererView.bundle;
    if (!root || !bundle) return;

    let cancelled = false;
    reactRootRef.current?.unmount();
    reactRootRef.current = null;
    moduleRef.current = null;
    clearShadowRoot(root);
    injectCss(root, bundle.css);
    installRendererRuntime();

    const actions: RendererActions = {
      send(text) {
        commandDispatch({ type: "SET_ACTION", action: { type: "send", text } });
      },
      fill(text) {
        commandDispatch({ type: "SET_ACTION", action: { type: "fill", text } });
      },
    };

    const getSnapshot = () => {
      const snapshot = snapshotRef.current;
      if (!snapshot) throw new Error("Renderer snapshot is not ready.");
      return snapshot;
    };
    const subscribe = (listener: () => void) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    };

    void importRendererModule(bundle.js)
      .then((mod) => {
        if (cancelled) return;
        moduleRef.current = mod;
        const reactRoot = createRoot(root);
        reactRootRef.current = reactRoot;
        reactRoot.render(
          <RendererShell
            Component={mod.default}
            actions={actions}
            getSnapshot={getSnapshot}
            subscribe={subscribe}
          />,
        );
        const snapshot = snapshotRef.current;
        rendererViewDispatch({
          type: "SET_THEME",
          theme: snapshot ? validateTheme(mod.theme?.(snapshot) ?? null) : null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        rendererViewDispatch({ type: "SET_ERROR", error: message });
      });

    return () => {
      cancelled = true;
      reactRootRef.current?.unmount();
      reactRootRef.current = null;
      moduleRef.current = null;
      clearShadowRoot(root);
    };
  }, [rendererView.bundle, commandDispatch, rendererViewDispatch]);

  useEffect(() => {
    if (state.isStreaming) return;
    const root = shadowRootRef.current;
    if (!root) return;
    const anchor = root.querySelector("[data-chat-anchor]");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth" });
    }
  }, [rendererView.snapshot, state.isStreaming]);

  const error = rendererView.error;

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div
          ref={hostElementRef}
          data-renderer-host
          className="h-full min-h-full"
        />
        {error ? (
          <div className="p-4 text-sm text-danger font-mono whitespace-pre-wrap">
            <p>Renderer error:</p>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{error}</pre>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
