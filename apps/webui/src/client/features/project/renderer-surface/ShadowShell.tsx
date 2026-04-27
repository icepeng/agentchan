import { useLayoutEffect, useRef } from "react";
import type { RendererLayerId } from "@/client/entities/renderer/bundle/index.js";
import {
  clearRendererStyles,
  disposeLayerHostRuntime,
  getLayerHostRuntime,
  injectCss,
  isRendererInstance,
  type ShadowShellHandle,
} from "./shadow-runtime.js";

export type { ShadowShellHandle } from "./shadow-runtime.js";

interface ShadowShellProps {
  className: string;
  layer: RendererLayerId;
  register: (layer: RendererLayerId, handle: ShadowShellHandle | null) => void;
}

export function ShadowShell({
  className,
  layer,
  register,
}: ShadowShellProps) {
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

    const handle: ShadowShellHandle = {
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
        // Renderer adapters capture this actions object for the mount lifetime.
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
        disposeLayerHostRuntime(host);
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
