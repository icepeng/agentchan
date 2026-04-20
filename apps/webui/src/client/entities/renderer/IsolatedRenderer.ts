import {
  resolveThemeVars,
  type MountFn,
  type RendererInstance,
  type RendererTheme,
  type ThemeFn,
} from "@agentchan/renderer-runtime";
import type { RenderContext } from "./renderer.types.js";

// The iframe is a DOM/CSS boundary, not a security sandbox — the renderer
// runs in the host realm and mutates the iframe body directly.

export interface AdoptedRenderer {
  mount: MountFn;
  theme?: ThemeFn;
}

export interface IsolatedRendererOptions {
  adopted: AdoptedRenderer;
  baseCss: string;
  theme: "light" | "dark";
  onTheme(theme: RendererTheme | null): void;
  onError(message: string): void;
  // Fires once after the first mount has painted. Host uses this to fade
  // out the previous instance without a blank gap between project switches.
  onFirstPaint?(): void;
}

function buildBootstrapHtml(opts: {
  baseCss: string;
  theme: "light" | "dark";
}): string {
  return [
    "<!doctype html>",
    `<html data-theme="${opts.theme}"><head>`,
    '<meta charset="utf-8">',
    `<style>${opts.baseCss}</style>`,
    "</head><body></body></html>",
  ].join("");
}

export interface IsolatedRendererInstance extends RendererInstance {
  fadeOutAndDestroy(durationMs?: number): void;
}

class IsolatedRendererImpl implements IsolatedRendererInstance {
  private readonly iframe: HTMLIFrameElement;
  private instance: RendererInstance | null = null;
  private destroyed = false;
  private pendingCtx: RenderContext | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    target: HTMLElement,
    initialCtx: RenderContext,
    private readonly options: IsolatedRendererOptions,
  ) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "renderer");
    // Absolute overlay so the host can stack two iframes in the same target
    // during project switches and cross-fade between them.
    iframe.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent;opacity:0;transition:opacity 300ms ease;";
    iframe.srcdoc = buildBootstrapHtml({
      baseCss: options.baseCss,
      theme: options.theme,
    });
    iframe.addEventListener("load", () => this.onLoad(), { once: true });
    target.appendChild(iframe);
    this.iframe = iframe;
    this.pendingCtx = initialCtx;
  }

  private onLoad(): void {
    if (this.destroyed) return;
    const doc = this.iframe.contentDocument;
    if (!doc) {
      this.options.onError("iframe document unavailable");
      return;
    }
    const ctx = this.pendingCtx;
    this.pendingCtx = null;
    if (!ctx) return;
    try {
      this.instance = this.options.adopted.mount(doc.body, ctx);
    } catch (err) {
      this.options.onError(err instanceof Error ? err.message : String(err));
      return;
    }
    this.applyTheme(ctx);
    this.iframe.style.opacity = "1";
    this.options.onFirstPaint?.();
  }

  private applyTheme(ctx: RenderContext): void {
    const fn = this.options.adopted.theme;
    if (!fn) {
      this.options.onTheme(null);
      return;
    }
    let theme: RendererTheme;
    try {
      theme = fn(ctx);
    } catch {
      // Theme function bug — leave previous theme in place.
      return;
    }
    this.options.onTheme(theme);
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    const userScheme: "light" | "dark" =
      root.getAttribute("data-theme") === "light" ? "light" : "dark";
    const { vars, effectiveScheme } = resolveThemeVars(theme, userScheme);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    if (effectiveScheme !== userScheme) {
      root.setAttribute("data-theme", effectiveScheme);
    }
  }

  update(ctx: RenderContext): void {
    if (this.destroyed) return;
    if (!this.instance) {
      // iframe still bootstrapping — coalesce to the freshest ctx.
      this.pendingCtx = ctx;
      return;
    }
    try {
      this.instance.update(ctx);
    } catch (err) {
      // Per-tick update errors are swallowed after first paint so a buggy
      // frame doesn't flash the error UI mid-stream.
      console.warn(
        "[renderer] update error (swallowed):",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    this.applyTheme(ctx);
  }

  fadeOutAndDestroy(durationMs = 300): void {
    if (this.destroyed) return;
    this.iframe.style.opacity = "0";
    this.fadeTimer = setTimeout(() => this.destroy(), durationMs);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    try {
      this.instance?.destroy();
    } catch {
      // iframe is about to be removed; any destroy error is moot.
    }
    this.instance = null;
    this.iframe.remove();
  }
}

export function createIsolatedRenderer(
  target: HTMLElement,
  initialCtx: RenderContext,
  options: IsolatedRendererOptions,
): IsolatedRendererInstance {
  return new IsolatedRendererImpl(target, initialCtx, options);
}
