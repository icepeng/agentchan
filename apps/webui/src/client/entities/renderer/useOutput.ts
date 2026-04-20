import { useCallback, useEffect, useRef } from "react";
import * as rendererRuntime from "@agentchan/renderer-runtime";
import type {
  MountFn,
  RenderFn,
  ThemeFn,
} from "@agentchan/renderer-runtime";
import type {
  AdoptedRenderer,
  IsolatedRendererInstance,
} from "./IsolatedRenderer.js";
import {
  EMPTY_AGENT_STATE,
  useAgentState,
} from "@/client/entities/agent-state/index.js";
import {
  useProjectSelectionState,
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
} from "@/client/entities/project/index.js";
import { useRendererViewDispatch } from "./RendererViewContext.js";
import { useRendererActions } from "./RendererActionContext.js";
import { validateTheme } from "./projectTheme.js";
import { createIsolatedRenderer } from "./IsolatedRenderer.js";
import type { ProjectFile, RenderContext } from "./renderer.types.js";

// The transpiled renderer module rewrites `import { defineRenderer } from
// "@agentchan/renderer-runtime"` into `const { ... } = globalThis.__rendererRuntime;`
// server-side (project.service.ts#transpileRenderer). The Blob URL import we
// do here has no bundler around it, so the global provides the resolution.
(globalThis as unknown as { __rendererRuntime: typeof rendererRuntime }).__rendererRuntime =
  rendererRuntime;

// base.css (Tailwind preflight + @theme tokens + scrollbar styles + font
// imports) is invariant per process and fetched once per session.
let baseCssCache: Promise<string> | null = null;

function fetchBaseCss(): Promise<string> {
  if (!baseCssCache) {
    baseCssCache = fetch("/api/renderer-runtime/base.css").then((res) => {
      if (!res.ok) {
        baseCssCache = null;
        throw new Error(`renderer-runtime base.css fetch failed: ${res.status}`);
      }
      return res.text();
    });
  }
  return baseCssCache;
}

interface RendererModule {
  mount?: MountFn;
  default?: { mount?: MountFn; theme?: ThemeFn };
  render?: RenderFn;
  theme?: ThemeFn;
}

function adoptRenderer(mod: RendererModule): AdoptedRenderer {
  if (typeof mod.mount === "function") {
    return mod.theme
      ? { mount: mod.mount, theme: mod.theme }
      : { mount: mod.mount };
  }
  if (mod.default && typeof mod.default.mount === "function") {
    return mod.default.theme
      ? { mount: mod.default.mount, theme: mod.default.theme }
      : { mount: mod.default.mount };
  }
  if (typeof mod.render === "function") {
    const wrapped = rendererRuntime.defineRenderer(
      mod.render,
      mod.theme ? { theme: mod.theme } : undefined,
    );
    return wrapped.theme
      ? { mount: wrapped.mount, theme: wrapped.theme }
      : { mount: wrapped.mount };
  }
  throw new Error(
    "renderer.ts must export mount() (default or named) or render()",
  );
}

async function loadRendererModule(js: string): Promise<AdoptedRenderer> {
  const blob = new Blob([js], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = (await import(/* @vite-ignore */ url)) as RendererModule;
    return adoptRenderer(mod);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function currentHostTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

function projectBaseUrl(slug: string): string {
  return `/api/projects/${encodeURIComponent(slug)}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function errorHtml(message: string): string {
  return `<div style="color: var(--color-danger); font-size: 14px; font-family: var(--font-family-mono); padding: 16px;">
    <p>Renderer error:</p>
    <pre style="margin-top: 8px; font-size: 12px; white-space: pre-wrap;">${escapeHtml(message)}</pre>
  </div>`;
}

const NOT_FOUND_HTML = `<div style="color: var(--color-fg-4); font-size: 14px; font-family: var(--font-family-mono); text-align: center; padding: 48px 0;">
  <p>renderer.ts not found</p>
  <p style="margin-top: 8px; font-size: 12px; opacity: 0.7;">Create a renderer.ts file in the project folder to render output.</p>
</div>`;

interface RendererSnapshot {
  slug: string;
  files: ProjectFile[];
}

export function useOutput() {
  const { activeProjectSlug } = useProjectSelectionState();
  const rendererViewDispatch = useRendererViewDispatch();
  const actions = useRendererActions();

  const agentState = useAgentState();
  const stateRef = useRef(agentState);
  useEffect(() => {
    stateRef.current = agentState;
  });

  const targetRef = useRef<HTMLElement | null>(null);
  const instanceRef = useRef<IsolatedRendererInstance | null>(null);
  // Outgoing instance during a cross-fade — kept alive until its successor
  // reports first paint, then faded out. May be null at any time.
  const fadingInstanceRef = useRef<IsolatedRendererInstance | null>(null);
  const lastSnapshotRef = useRef<RendererSnapshot | null>(null);

  // Caller must give the target `position: relative` (or another non-static
  // value) so the absolute-positioned iframes anchor here, not to an
  // ancestor.
  const attach = useCallback((el: HTMLElement | null) => {
    targetRef.current = el;
  }, []);

  const destroyFadingInstance = useCallback(() => {
    if (fadingInstanceRef.current) {
      try {
        fadingInstanceRef.current.destroy();
      } catch {
        // Outgoing renderer's destroy threw — iframe is already removed below.
      }
      fadingInstanceRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    destroyFadingInstance();
    if (instanceRef.current) {
      try {
        instanceRef.current.destroy();
      } catch {
        // Renderer destroy errors are absorbed — iframe removal is unavoidable
        // and a buggy renderer must not wedge the host.
      }
      instanceRef.current = null;
    }
    lastSnapshotRef.current = null;
  }, [destroyFadingInstance]);

  const renderError = useCallback(
    (html: string) => {
      teardown();
      const target = targetRef.current;
      if (target) target.innerHTML = html;
      rendererViewDispatch({ type: "SET_THEME", theme: null });
    },
    [teardown, rendererViewDispatch],
  );

  const handleTheme = useCallback(
    (raw: unknown) => {
      const theme = validateTheme(raw);
      rendererViewDispatch({ type: "SET_THEME", theme });
    },
    [rendererViewDispatch],
  );

  const refresh = useCallback(async () => {
    const slug = activeProjectSlug;
    if (!slug) {
      teardown();
      const target = targetRef.current;
      if (target) target.innerHTML = "";
      rendererViewDispatch({ type: "SET_THEME", theme: null });
      return;
    }

    let result: { js: string };
    let filesResult: { files: ProjectFile[] };
    let baseCss: string;
    let adopted: AdoptedRenderer;
    try {
      [result, filesResult, baseCss] = await Promise.all([
        fetchTranspiledRenderer(slug),
        fetchWorkspaceFiles(slug),
        fetchBaseCss(),
      ]);
      adopted = await loadRendererModule(result.js);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("404")) {
        renderError(NOT_FOUND_HTML);
      } else {
        renderError(errorHtml(e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    const target = targetRef.current;
    if (!target) {
      // RenderedView unmounted between fetch and mount — bail without
      // touching DOM. The next attach+refresh will reload anew.
      return;
    }

    // Cross-fade orchestration: instead of tearing down the previous instance
    // immediately we promote it to fadingInstanceRef and fade it out only
    // after the successor signals first paint. If a previous fade was already
    // in flight, drop it first — three layers stacked would just show the
    // bottom one anyway.
    destroyFadingInstance();
    const outgoing = instanceRef.current;
    instanceRef.current = null;
    fadingInstanceRef.current = outgoing;
    // Clear any error HTML from a previous failure before mounting iframe.
    // Don't wipe innerHTML if there's an outgoing iframe still in the DOM.
    if (!outgoing) target.innerHTML = "";

    const ctx: RenderContext = {
      files: filesResult.files,
      baseUrl: projectBaseUrl(slug),
      state: EMPTY_AGENT_STATE,
      actions,
    };

    try {
      const instance = createIsolatedRenderer(target, ctx, {
        adopted,
        baseCss,
        theme: currentHostTheme(),
        onTheme: handleTheme,
        onError: (message) => renderError(errorHtml(message)),
        onFirstPaint: () => {
          // Fade duration matches the iframe's CSS transition so destroy
          // lands right when opacity hits zero.
          const fading = fadingInstanceRef.current;
          if (fading) {
            fadingInstanceRef.current = null;
            fading.fadeOutAndDestroy(300);
          }
        },
      });
      instanceRef.current = instance;
      lastSnapshotRef.current = { slug, files: filesResult.files };
    } catch (e: unknown) {
      // New instance failed to mount — keep the old iframe up so the user
      // doesn't see a blank screen, just an error overlay.
      destroyFadingInstance();
      renderError(errorHtml(e instanceof Error ? e.message : String(e)));
    }
  }, [
    activeProjectSlug,
    rendererViewDispatch,
    teardown,
    destroyFadingInstance,
    renderError,
    handleTheme,
    actions,
  ]);

  const refreshState = useCallback(() => {
    const slug = activeProjectSlug;
    if (!slug) return;
    const snap = lastSnapshotRef.current;
    if (!snap || snap.slug !== slug) return;
    const instance = instanceRef.current;
    if (!instance) return;

    const ctx: RenderContext = {
      files: snap.files,
      baseUrl: projectBaseUrl(slug),
      state: stateRef.current,
      actions,
    };

    try {
      instance.update(ctx);
    } catch {
      // Renderer update threw — next refresh will recover.
    }
  }, [activeProjectSlug, actions]);

  return { attach, teardown, refresh, refreshState };
}
