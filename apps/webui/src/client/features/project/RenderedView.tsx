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
type RendererLayer = 0 | 1;

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

function clearRendererStyles(root: ShadowRoot): void {
  for (const node of root.querySelectorAll("style[data-renderer-style]")) {
    node.remove();
  }
}

function injectCss(root: ShadowRoot, css: readonly string[]): void {
  for (const text of css) {
    const style = document.createElement("style");
    style.setAttribute("data-renderer-style", "");
    style.textContent = text;
    root.prepend(style);
  }
}

function appendMountNode(root: ShadowRoot): HTMLDivElement {
  const mount = document.createElement("div");
  mount.setAttribute("data-renderer-mount", "");
  mount.style.height = "100%";
  mount.style.minHeight = "100%";
  root.append(mount);
  return mount;
}

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh, refreshState } = useRendererOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostElementRefs = useRef<[HTMLDivElement | null, HTMLDivElement | null]>([null, null]);
  const shadowRootRefs = useRef<[ShadowRoot | null, ShadowRoot | null]>([null, null]);
  const layerSnapshotsRef = useRef<[RendererSnapshot | null, RendererSnapshot | null]>([
    rendererView.snapshot,
    null,
  ]);
  const layerListenersRef = useRef<[Set<() => void>, Set<() => void>]>([
    new Set(),
    new Set(),
  ]);
  const moduleRefs = useRef<[RendererModule | null, RendererModule | null]>([null, null]);
  const reactRootRefs = useRef<[Root | null, Root | null]>([null, null]);
  const reactMountRefs = useRef<[HTMLDivElement | null, HTMLDivElement | null]>([null, null]);
  const rendererSnapshotRef = useRef(rendererView.snapshot);
  const stateRef = useRef(state);
  const prevSlugRef = useRef<string | null>(project.activeProjectSlug);
  const activeProjectSlugRef = useRef<string | null>(project.activeProjectSlug);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frontPaintKeyRef = useRef(0);
  const activeLayerRef = useRef<RendererLayer>(0);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [activeLayer, setActiveLayer] = useState<RendererLayer>(0);
  const [exitingLayer, setExitingLayer] = useState<RendererLayer | null>(null);
  const [frontPaintKey, setFrontPaintKey] = useState(0);
  const [capturePaintKey, setCapturePaintKey] = useState(0);

  useLayoutEffect(() => {
    rendererSnapshotRef.current = rendererView.snapshot;
    activeProjectSlugRef.current = project.activeProjectSlug;
    activeLayerRef.current = activeLayer;
  });

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    for (const layer of [0, 1] as const) {
      const hostElement = hostElementRefs.current[layer];
      if (!hostElement || shadowRootRefs.current[layer]) continue;
      const root = hostElement.attachShadow({ mode: "open" });
      const mount = appendMountNode(root);
      shadowRootRefs.current[layer] = root;
      reactMountRefs.current[layer] = mount;
      reactRootRefs.current[layer] = createRoot(mount);
    }
  }, []);

  const clearLayer = (layer: RendererLayer) => {
    reactRootRefs.current[layer]?.render(null);
    moduleRefs.current[layer] = null;
    layerSnapshotsRef.current[layer] = null;
    const root = shadowRootRefs.current[layer];
    if (root) clearRendererStyles(root);
  };

  /* eslint-disable react-hooks/set-state-in-effect -- Layer state must switch in the layout phase so the outgoing renderer is captured before paint. */
  useLayoutEffect(() => {
    const newSlug = project.activeProjectSlug;
    if (prevSlugRef.current !== null && prevSlugRef.current !== newSlug) {
      const currentLayer = activeLayerRef.current;
      const nextLayer: RendererLayer = currentLayer === 0 ? 1 : 0;
      const currentRoot = shadowRootRefs.current[currentLayer];
      if (currentRoot && currentRoot.childNodes.length > 0) {
        if (cleanupTimerRef.current !== null) {
          clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }
        clearLayer(nextLayer);
        activeLayerRef.current = nextLayer;
        setActiveLayer(nextLayer);
        setExitingLayer(currentLayer);
        setCapturePaintKey(frontPaintKeyRef.current);
        setPhase("capture");
      } else {
        activeLayerRef.current = nextLayer;
        setActiveLayer(nextLayer);
      }
    }
    prevSlugRef.current = newSlug;
    void refresh();
  }, [project.activeProjectSlug, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const layer = activeLayerRef.current;
    layerSnapshotsRef.current[layer] = snapshot;
    if (snapshot) {
      for (const listener of layerListenersRef.current[layer]) listener();
    }

    const mod = moduleRefs.current[layer];
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
    const layer = activeLayerRef.current;
    const root = shadowRootRefs.current[layer];
    const bundle = rendererView.bundle;
    const bundleSlug = rendererSnapshotRef.current?.slug ?? null;
    if (!root || !bundle) return;

    let cancelled = false;
    clearLayer(layer);
    layerSnapshotsRef.current[layer] = rendererSnapshotRef.current;
    injectCss(root, bundle.css);
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
      const snapshot = layerSnapshotsRef.current[layer];
      if (!snapshot) throw new Error("Renderer snapshot is not ready.");
      return snapshot;
    };
    const subscribe = (listener: () => void) => {
      layerListenersRef.current[layer].add(listener);
      return () => layerListenersRef.current[layer].delete(listener);
    };

    void importRendererModule(bundle.js)
      .then((mod) => {
        if (cancelled) return;
        if (bundleSlug !== activeProjectSlugRef.current) return;
        moduleRefs.current[layer] = mod;
        const reactRoot = reactRootRefs.current[layer];
        if (!reactRoot) return;
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
        const snapshot = layerSnapshotsRef.current[layer];
        rendererViewDispatch({
          type: "SET_THEME",
          theme: snapshot ? validateTheme(mod.theme?.(snapshot) ?? null) : null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (bundleSlug !== activeProjectSlugRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        rendererViewDispatch({ type: "SET_ERROR", error: message });
      });

    return () => {
      cancelled = true;
      if (activeLayerRef.current === layer) {
        clearLayer(layer);
      }
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
      if (exitingLayer !== null) clearLayer(exitingLayer);
      setExitingLayer(null);
      cleanupTimerRef.current = null;
      setPhase("idle");
    }, FADE_DURATION_MS);
    cleanupTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [phase, exitingLayer]);

  const error = rendererView.error;
  const exitingOpacityClass =
    phase === "capture"
      ? "opacity-100 transition-none"
      : phase === "fading"
        ? "opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0"
        : "opacity-0 transition-none";

  const layerClass = (layer: RendererLayer) => {
    if (layer === activeLayer) {
      return "relative z-10 h-full min-h-full";
    }
    if (layer === exitingLayer) {
      return `pointer-events-none absolute left-0 right-0 top-0 z-20 ${exitingOpacityClass}`;
    }
    return "hidden";
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div className="relative h-full min-h-full">
          {[0, 1].map((layer) => (
            <div
              key={layer}
              ref={(element) => {
                hostElementRefs.current[layer] = element;
              }}
              data-renderer-host
              data-renderer-layer={layer}
              className={layerClass(layer as RendererLayer)}
            />
          ))}
        </div>
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
