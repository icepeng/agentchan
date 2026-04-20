import {
  resolveThemeVars,
  validateTheme,
  TOKEN_TO_CSS,
  TOKEN_KEYS,
  type MountFn,
  type RendererInstance,
  type RendererTheme,
  type ThemeFn,
} from "@agentchan/renderer-runtime";
import type { RenderContext } from "./renderer.types.js";

const THEME_CSS_VARS = TOKEN_KEYS.map((k) => TOKEN_TO_CSS[k]);

function readThemeScheme(el: Element): "light" | "dark" {
  return el.getAttribute("data-theme") === "light" ? "light" : "dark";
}

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
  // Set when the host demotes this instance into the outgoing slot. `onLoad`
  // checks it to skip paint of a superseded instance whose iframe `load`
  // event arrived late — otherwise it would flash on top of the successor.
  private fading = false;
  private pendingCtx: RenderContext | null = null;
  private lastCtx: RenderContext | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private hostThemeObserver: MutationObserver | null = null;

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
    if (this.destroyed || this.fading) return;
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
    this.lastCtx = ctx;
    this.applyTheme(ctx);
    this.startHostThemeObserver();
    this.iframe.style.opacity = "1";
    this.options.onFirstPaint?.();
  }

  // Bridges host `<html data-theme>` changes into the iframe so the renderer
  // re-resolves dark/light tokens in real time. srcdoc bakes the scheme at
  // mount, but subsequent host toggles otherwise never reach us.
  private startHostThemeObserver(): void {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => this.syncHostTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    this.hostThemeObserver = observer;
  }

  private syncHostTheme(): void {
    if (this.destroyed || this.fading) return;
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    const hostScheme = readThemeScheme(document.documentElement);
    doc.documentElement.setAttribute("data-theme", hostScheme);
    if (this.lastCtx) this.applyTheme(this.lastCtx);
  }

  private applyTheme(ctx: RenderContext): void {
    const fn = this.options.adopted.theme;
    if (!fn) {
      this.options.onTheme(null);
      this.clearThemeVars();
      return;
    }
    let raw: unknown;
    try {
      raw = fn(ctx);
    } catch {
      // Theme function bug — leave previous theme in place.
      return;
    }
    const theme = validateTheme(raw);
    this.options.onTheme(theme);
    if (!theme) {
      this.clearThemeVars();
      return;
    }
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    const userScheme = readThemeScheme(root);
    const { vars, effectiveScheme } = resolveThemeVars(theme, userScheme);
    // Remove stale tokens before applying new ones. Tokens present on a
    // prior tick but absent from this resolution would otherwise stay stuck
    // as inline styles (dark-only override surviving a scheme flip, etc).
    for (const css of THEME_CSS_VARS) {
      if (!(css in vars)) root.style.removeProperty(css);
    }
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    if (effectiveScheme !== userScheme) {
      root.setAttribute("data-theme", effectiveScheme);
    }
  }

  private clearThemeVars(): void {
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    for (const css of THEME_CSS_VARS) root.style.removeProperty(css);
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
    this.lastCtx = ctx;
    this.applyTheme(ctx);
  }

  fadeOutAndDestroy(durationMs = 300): void {
    if (this.destroyed) return;
    this.fading = true;
    this.iframe.style.opacity = "0";
    this.fadeTimer = setTimeout(() => this.destroy(), durationMs);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.hostThemeObserver) {
      this.hostThemeObserver.disconnect();
      this.hostThemeObserver = null;
    }
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
