import { isRendererRuntime } from "@agentchan/renderer/core";
import type {
  RendererActions,
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";

export const FADE_DURATION_MS = 300;

export type RendererLayerId = 0 | 1;

export interface RendererModule {
  renderer: RendererRuntime;
}

export interface RendererBridge {
  snapshot: RendererSnapshot;
  actions: RendererActions;
}

export interface RendererInstance {
  update(snapshot: RendererSnapshot): void;
  unmount(): void;
}

export interface RendererRuntime {
  mount(container: HTMLElement, bridge: RendererBridge): RendererInstance;
  theme?: (snapshot: RendererSnapshot) => RendererTheme | null;
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
