import type {
  RendererActions,
  RendererInstance,
  RendererModule,
  RendererSnapshot,
} from "@/client/entities/renderer/index.js";

export interface ShadowShellHandle {
  clear: () => void;
  renderModule: (
    mod: RendererModule,
    actions: RendererActions,
    snapshot: RendererSnapshot,
  ) => void;
  setCss: (css: readonly string[]) => void;
  updateSnapshot: (snapshot: RendererSnapshot) => void;
}

export interface ShadowRuntime {
  mount: HTMLDivElement;
  instance: RendererInstance | null;
  shadowRoot: ShadowRoot;
  unmountTimer: number | null;
}

const shadowRuntimes = new WeakMap<HTMLDivElement, ShadowRuntime>();

export function clearRendererStyles(root: ShadowRoot): void {
  for (const node of root.querySelectorAll("style[data-renderer-style]")) {
    node.remove();
  }
}

export function injectCss(root: ShadowRoot, css: readonly string[]): void {
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

export function getShadowRuntime(host: HTMLDivElement): ShadowRuntime {
  const existing = shadowRuntimes.get(host);
  if (existing) return existing;

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const mount =
    shadowRoot.querySelector<HTMLDivElement>("[data-renderer-mount]") ??
    appendMountNode(shadowRoot);
  const runtime: ShadowRuntime = {
    mount,
    instance: null,
    shadowRoot,
    unmountTimer: null,
  };
  shadowRuntimes.set(host, runtime);
  return runtime;
}

export function disposeShadowRuntime(host: HTMLDivElement): void {
  shadowRuntimes.delete(host);
}

export function isRendererInstance(value: unknown): value is RendererInstance {
  if (typeof value !== "object" || value === null) return false;
  const instance = value as { update?: unknown; unmount?: unknown };
  return typeof instance.update === "function" && typeof instance.unmount === "function";
}
