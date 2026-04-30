import { useLayoutEffect, useRef } from "react";
import {
  clearRendererStyles,
  disposeShadowRuntime,
  getShadowRuntime,
  injectCss,
  isRendererInstance,
  type ShadowShellHandle,
} from "./shadow-runtime.js";

export type { ShadowShellHandle } from "./shadow-runtime.js";

interface ShadowShellProps {
  className: string;
  register: (handle: ShadowShellHandle | null) => void;
}

export function ShadowShell({ className, register }: ShadowShellProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = getShadowRuntime(host);
    if (runtime.unmountTimer !== null) {
      clearTimeout(runtime.unmountTimer);
      runtime.unmountTimer = null;
    }
    const { shadowRoot } = runtime;

    const handle: ShadowShellHandle = {
      clear() {
        runtime.instance?.unmount();
        runtime.instance = null;
        runtime.mount.replaceChildren();
        clearRendererStyles(shadowRoot);
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
      },
      setCss(css) {
        clearRendererStyles(shadowRoot);
        injectCss(shadowRoot, css);
      },
      updateSnapshot(snapshot) {
        runtime.instance?.update(snapshot);
      },
    };

    register(handle);
    return () => {
      register(null);
      handle.clear();
      runtime.unmountTimer = window.setTimeout(() => {
        runtime.instance?.unmount();
        runtime.instance = null;
        disposeShadowRuntime(host);
      }, 0);
    };
  }, [register]);

  return (
    <div
      ref={hostRef}
      data-renderer-shell
      className={className}
    />
  );
}
