import { useLayoutEffect, useRef } from "react";
import type { RendererActions, RendererSnapshot } from "@/client/entities/renderer/index.js";
import {
  type RendererLayerId,
  type RendererInstance,
  type RendererModule,
} from "./rendererRuntime.js";

export interface RendererLayerHandle {
  clear: () => void;
  hasContent: () => boolean;
  renderModule: (
    mod: RendererModule,
    actions: RendererActions,
    snapshot: RendererSnapshot,
  ) => void;
  setCss: (css: readonly string[]) => void;
  updateSnapshot: (snapshot: RendererSnapshot) => void;
}

interface RendererLayerProps {
  className: string;
  layer: RendererLayerId;
  register: (layer: RendererLayerId, handle: RendererLayerHandle | null) => void;
}

interface LayerHostRuntime {
  mount: HTMLDivElement;
  instance: RendererInstance | null;
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
    const { shadowRoot } = runtime;
    let hasContent = false;

    const handle: RendererLayerHandle = {
      clear() {
        runtime.instance?.unmount();
        runtime.instance = null;
        runtime.mount.replaceChildren();
        clearRendererStyles(shadowRoot);
        hasContent = false;
      },
      hasContent() {
        return hasContent;
      },
      renderModule(mod, actions, snapshot) {
        runtime.instance?.unmount();
        runtime.instance = null;
        runtime.mount.replaceChildren();
        const instance = mod.renderer.mount(runtime.mount, { snapshot, actions });
        if (!isRendererInstance(instance)) {
          throw new Error(
            "Renderer mount() must return an instance with update(snapshot) and unmount() functions.",
          );
        }
        runtime.instance = instance;
        hasContent = true;
      },
      setCss(css) {
        clearRendererStyles(shadowRoot);
        injectCss(shadowRoot, css);
      },
      updateSnapshot(snapshot) {
        runtime.instance?.update(snapshot);
      },
    };

    register(layer, handle);
    return () => {
      register(layer, null);
      handle.clear();
      runtime.unmountTimer = window.setTimeout(() => {
        runtime.instance?.unmount();
        runtime.instance = null;
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

function isRendererInstance(value: unknown): value is RendererInstance {
  if (typeof value !== "object" || value === null) return false;
  const instance = value as { update?: unknown; unmount?: unknown };
  return typeof instance.update === "function" && typeof instance.unmount === "function";
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
    instance: null,
    shadowRoot,
    unmountTimer: null,
  };
  layerHostRuntimes.set(host, runtime);
  return runtime;
}
