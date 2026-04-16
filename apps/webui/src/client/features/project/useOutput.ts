import { useCallback } from "react";
import {
  useProjectState,
  useProjectDispatch,
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
  validateTheme,
} from "@/client/entities/project/index.js";
import type { RenderContext, RendererTheme } from "@/client/entities/project/index.js";

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

export interface RenderOutput {
  html: string;
  theme: RendererTheme | null;
}

async function executeRenderer(
  jsCode: string,
  context: RenderContext,
): Promise<RenderOutput> {
  const blob = new Blob([jsCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (typeof mod.render !== "function") {
      return { html: errorHtml("renderer.ts must export a render() function"), theme: null };
    }
    const html: string = mod.render(context);
    const theme = validateTheme(mod.theme);
    return { html, theme };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 렌더러 fetch → transpile → execute를 한 번에 수행.
export async function loadRenderOutput(slug: string): Promise<RenderOutput> {
  try {
    const [rendererResult, filesResult] = await Promise.all([
      fetchTranspiledRenderer(slug),
      fetchWorkspaceFiles(slug),
    ]);
    const context: RenderContext = {
      files: filesResult.files,
      baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
    };
    return await executeRenderer(rendererResult.js, context);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("404")) {
      return { html: NOT_FOUND_HTML, theme: null };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { html: errorHtml(message), theme: null };
  }
}

export function useOutput() {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();

  const refresh = useCallback(async () => {
    const slug = projectState.activeProjectSlug;
    if (!slug) return;
    const { html, theme } = await loadRenderOutput(slug);
    projectDispatch({ type: "SET_RENDER_OUTPUT", html, theme });
  }, [projectState.activeProjectSlug, projectDispatch]);

  return { refresh };
}
