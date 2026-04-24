import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { jsxDEV } from "react/jsx-dev-runtime";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import {
  useRendererOutput,
  useRendererViewState,
  useRendererViewDispatch,
  useRendererActionDispatch,
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
type TransitionPhase = "idle" | "capture" | "fading";

const FADE_DURATION_MS = 300;

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

function clearShadowRoot(root: ShadowRoot, preserve?: Node | null): void {
  for (const child of Array.from(root.childNodes)) {
    if (preserve && child === preserve) continue;
    if (
      child instanceof HTMLElement &&
      child.hasAttribute("data-renderer-disposing")
    ) {
      continue;
    }
    child.remove();
  }
}

function injectCss(root: ShadowRoot, css: readonly string[]): void {
  for (const text of css) {
    const style = document.createElement("style");
    style.textContent = text;
    root.append(style);
  }
}

function appendMountNode(root: ShadowRoot): HTMLDivElement {
  const mount = document.createElement("div");
  mount.setAttribute("data-renderer-mount", "");
  mount.className = "h-full min-h-full";
  root.append(mount);
  return mount;
}

function deferUnmount(root: Root | null, mount: HTMLDivElement | null): void {
  if (!root) {
    mount?.remove();
    return;
  }
  if (mount) {
    mount.hidden = true;
    mount.setAttribute("data-renderer-disposing", "");
  }
  setTimeout(() => {
    root.unmount();
    mount?.remove();
  }, 0);
}

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh, refreshState } = useRendererOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostElementRef = useRef<HTMLDivElement>(null);
  const backHostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const backShadowRootRef = useRef<ShadowRoot | null>(null);
  const snapshotRef = useRef<RendererSnapshot | null>(rendererView.snapshot);
  const listenersRef = useRef(new Set<() => void>());
  const moduleRef = useRef<RendererModule | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const reactMountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const prevSlugRef = useRef<string | null>(project.activeProjectSlug);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frontPaintKeyRef = useRef(0);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [frontPaintKey, setFrontPaintKey] = useState(0);
  const [capturePaintKey, setCapturePaintKey] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const hostElement = hostElementRef.current;
    if (!hostElement || shadowRootRef.current) return;
    shadowRootRef.current = hostElement.attachShadow({ mode: "open" });
  }, []);

  useLayoutEffect(() => {
    const newSlug = project.activeProjectSlug;
    if (prevSlugRef.current !== null && prevSlugRef.current !== newSlug) {
      const frontRoot = shadowRootRef.current;
      const backHost = backHostRef.current;
      const viewport = containerRef.current;
      if (frontRoot && backHost && frontRoot.childNodes.length > 0) {
        if (cleanupTimerRef.current !== null) {
          clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }
        const backRoot =
          backShadowRootRef.current ??
          backHost.attachShadow({ mode: "open" });
        backShadowRootRef.current = backRoot;
        backRoot.innerHTML = frontRoot.innerHTML;
        const scrollTop = viewport?.scrollTop ?? 0;
        backHost.style.transform =
          scrollTop > 0 ? `translateY(-${scrollTop}px)` : "";
        setCapturePaintKey(frontPaintKeyRef.current);
        setPhase("capture");
      }
    }
    prevSlugRef.current = newSlug;
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
    if (snapshot) {
      for (const listener of listenersRef.current) listener();
    }

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
    const previousRoot = reactRootRef.current;
    const previousMount = reactMountRef.current;
    deferUnmount(previousRoot, previousMount);
    reactRootRef.current = null;
    reactMountRef.current = null;
    moduleRef.current = null;
    clearShadowRoot(root, previousMount);
    injectCss(root, bundle.css);
    const mount = appendMountNode(root);
    reactMountRef.current = mount;
    installRendererRuntime();

    const actions: RendererActions = {
      send(text) {
        actionDispatch({ type: "SET_ACTION", action: { type: "send", text } });
      },
      fill(text) {
        actionDispatch({ type: "SET_ACTION", action: { type: "fill", text } });
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
        const mount = reactMountRef.current;
        if (!mount) return;
        const reactRoot = createRoot(mount);
        reactRootRef.current = reactRoot;
        reactRoot.render(
          <RendererShell
            Component={mod.default}
            actions={actions}
            getSnapshot={getSnapshot}
            subscribe={subscribe}
          />,
        );
        requestAnimationFrame(() => {
          setFrontPaintKey((key) => {
            const next = key + 1;
            frontPaintKeyRef.current = next;
            return next;
          });
        });
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
      const currentRoot = reactRootRef.current;
      const currentMount = reactMountRef.current;
      deferUnmount(currentRoot, currentMount);
      reactRootRef.current = null;
      reactMountRef.current = null;
      moduleRef.current = null;
      clearShadowRoot(root, currentMount);
    };
  }, [rendererView.bundle, actionDispatch, rendererViewDispatch]);

  useEffect(() => {
    if (phase !== "capture" || frontPaintKey <= capturePaintKey) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("fading"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, frontPaintKey, capturePaintKey]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => {
      const backRoot = backShadowRootRef.current;
      const backHost = backHostRef.current;
      if (backRoot) backRoot.innerHTML = "";
      if (backHost) backHost.style.transform = "";
      cleanupTimerRef.current = null;
      setPhase("idle");
    }, FADE_DURATION_MS);
    cleanupTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [phase]);

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
  const backOpacityClass =
    phase === "capture"
      ? "opacity-100 transition-none"
      : phase === "fading"
        ? "opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0"
        : "opacity-0 transition-none";

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
      <div
        ref={backHostRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden ${backOpacityClass}`}
      />
    </div>
  );
}
