import { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { RendererActions } from "@/client/entities/renderer/index.js";
import {
  RendererShell,
  type RendererLayerId,
  type RendererModule,
  type Root,
} from "./rendererRuntime.js";
import type { RendererSnapshotStore } from "./useRendererSnapshots.js";

export interface RendererLayerHandle {
  clear: () => void;
  hasContent: () => boolean;
  renderModule: (
    mod: RendererModule,
    actions: RendererActions,
    snapshots: RendererSnapshotStore,
  ) => void;
  setCss: (css: readonly string[]) => void;
}

interface RendererLayerProps {
  className: string;
  layer: RendererLayerId;
  register: (layer: RendererLayerId, handle: RendererLayerHandle | null) => void;
}

interface LayerHostRuntime {
  mount: HTMLDivElement;
  reactRoot: Root;
  shadowRoot: ShadowRoot;
  unmountTimer: number | null;
}

const layerHostRuntimes = new WeakMap<HTMLDivElement, LayerHostRuntime>();

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

export function RendererLayer({
  className,
  layer,
  register,
}: RendererLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = getLayerHostRuntime(host);
    if (runtime.unmountTimer !== null) {
      clearTimeout(runtime.unmountTimer);
      runtime.unmountTimer = null;
    }
    const { reactRoot, shadowRoot } = runtime;
    let hasContent = false;

    const handle: RendererLayerHandle = {
      clear() {
        reactRoot.render(null);
        clearRendererStyles(shadowRoot);
        hasContent = false;
      },
      hasContent() {
        return hasContent;
      },
      renderModule(mod, actions, snapshots) {
        reactRoot.render(
          <RendererShell
            Component={mod.default}
            actions={actions}
            getSnapshot={() => snapshots.getSnapshot(layer)}
            subscribe={(listener) => snapshots.subscribe(layer, listener)}
          />,
        );
        hasContent = true;
      },
      setCss(css) {
        clearRendererStyles(shadowRoot);
        injectCss(shadowRoot, css);
      },
    };

    register(layer, handle);
    return () => {
      register(layer, null);
      handle.clear();
      runtime.unmountTimer = window.setTimeout(() => {
        reactRoot.unmount();
        layerHostRuntimes.delete(host);
      }, 0);
    };
  }, [layer, register]);

  return (
    <div
      ref={hostRef}
      data-renderer-host
      data-renderer-layer={layer}
      className={className}
    />
  );
}

function getLayerHostRuntime(host: HTMLDivElement): LayerHostRuntime {
  const existing = layerHostRuntimes.get(host);
  if (existing) return existing;

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const mount =
    shadowRoot.querySelector<HTMLDivElement>("[data-renderer-mount]") ??
    appendMountNode(shadowRoot);
  const runtime = {
    mount,
    reactRoot: createLayerRoot(mount),
    shadowRoot,
    unmountTimer: null,
  };
  layerHostRuntimes.set(host, runtime);
  return runtime;
}

function createLayerRoot(mount: HTMLDivElement): Root {
  return (window as typeof window & {
    __agentchanCreateRendererRoot?: (mount: HTMLDivElement) => Root;
  }).__agentchanCreateRendererRoot?.(mount) ?? createRoot(mount);
}
