import {
  isRendererRuntime,
  type RendererBridge,
  type RendererInstance,
  type RendererRuntime,
} from "@agentchan/renderer/core";

export type {
  RendererBridge,
  RendererInstance,
  RendererRuntime,
} from "@agentchan/renderer/core";

export interface RendererModule {
  renderer: RendererRuntime;
}

export function importRendererModule(js: string): Promise<RendererModule> {
  const blob = new Blob([js], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  return import(/* @vite-ignore */ url)
    .then((mod: { renderer?: unknown }) => {
      if (!isRendererRuntime(mod.renderer)) {
        throw new Error(
          "Renderer module must export const renderer with a mount(container, bridge) function.",
        );
      }
      return { renderer: mod.renderer };
    })
    .finally(() => URL.revokeObjectURL(url));
}
