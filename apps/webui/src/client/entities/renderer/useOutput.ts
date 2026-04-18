import { useCallback } from "react";
import {
  useProjectSelectionState,
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
} from "@/client/entities/project/index.js";
import { useRendererViewDispatch } from "./RendererViewContext.js";
import { validateTheme, resolveRawTheme } from "./projectTheme.js";
import type { RenderContext, RendererTheme } from "./renderer.types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

async function executeRenderer(
  jsCode: string,
  context: RenderContext,
): Promise<{ html: string; theme: RendererTheme | null }> {
  const blob = new Blob([jsCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (typeof mod.render !== "function") {
      return { html: errorHtml("renderer.ts must export a render() function"), theme: null };
    }
    const html: string = mod.render(context);
    const theme = validateTheme(resolveRawTheme(mod.theme, context));
    return { html, theme };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useOutput() {
  const { activeProjectSlug } = useProjectSelectionState();
  const rendererViewDispatch = useRendererViewDispatch();

  const refresh = useCallback(async () => {
    const slug = activeProjectSlug;
    if (!slug) return;

    try {
      const [rendererResult, filesResult] = await Promise.all([
        fetchTranspiledRenderer(slug),
        fetchWorkspaceFiles(slug),
      ]);

      const context: RenderContext = {
        files: filesResult.files,
        baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
      };

      const { html, theme } = await executeRenderer(rendererResult.js, context);
      rendererViewDispatch({ type: "SET_OUTPUT", html, theme });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("404")) {
        rendererViewDispatch({ type: "SET_OUTPUT", html: NOT_FOUND_HTML, theme: null });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        rendererViewDispatch({ type: "SET_OUTPUT", html: errorHtml(message), theme: null });
      }
    }
  }, [activeProjectSlug, rendererViewDispatch]);

  return { refresh };
}
