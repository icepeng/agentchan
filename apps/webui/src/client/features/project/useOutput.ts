import { useCallback } from "react";
import {
  useProjectState,
  useProjectDispatch,
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
} from "@/client/entities/project/index.js";
import type { RenderContext } from "@/client/entities/project/index.js";

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

async function executeRenderer(jsCode: string, context: RenderContext): Promise<string> {
  const blob = new Blob([jsCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (typeof mod.render !== "function") {
      return errorHtml("renderer.ts must export a render() function");
    }
    return mod.render(context);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useOutput() {
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();

  const refresh = useCallback(async () => {
    const slug = projectState.activeProjectSlug;
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

      const html = await executeRenderer(rendererResult.js, context);
      projectDispatch({ type: "SET_RENDERED_HTML", html });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("404")) {
        projectDispatch({ type: "SET_RENDERED_HTML", html: NOT_FOUND_HTML });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        projectDispatch({ type: "SET_RENDERED_HTML", html: errorHtml(message) });
      }
    }
  }, [projectState.activeProjectSlug, projectDispatch]);

  return { refresh };
}
