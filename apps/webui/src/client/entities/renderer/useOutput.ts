import { useCallback, useEffect, useRef } from "react";
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
import { validateTheme, resolveRawTheme } from "./projectTheme.js";
import {
  type ProjectFile,
  type RenderContext,
} from "./renderer.types.js";

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

type RenderFn = (ctx: RenderContext) => string;

// The blob URL can be revoked immediately because the imported module
// closures hold live references to renderFn/rawTheme.
async function compileRenderer(jsCode: string): Promise<{
  renderFn: RenderFn;
  rawTheme: unknown;
}> {
  const blob = new Blob([jsCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (typeof mod.render !== "function") {
      throw new Error("renderer.ts must export a render() function");
    }
    return { renderFn: mod.render as RenderFn, rawTheme: mod.theme };
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface RendererSnapshot {
  slug: string;
  files: ProjectFile[];
  renderFn: RenderFn;
  rawTheme: unknown;
}

export function useOutput() {
  const { activeProjectSlug } = useProjectSelectionState();
  const rendererViewDispatch = useRendererViewDispatch();

  // useAgentState reads from the active project slot. Capturing it via ref
  // lets `refreshState` read the latest snapshot without rebinding the rAF
  // loop in RenderedView on every event.
  const agentState = useAgentState();
  const stateRef = useRef(agentState);
  useEffect(() => {
    stateRef.current = agentState;
  });

  // Snapshot reused during streaming so refreshState avoids refetch/recompile.
  // files may drift during a stream; full refresh on completion resyncs it.
  const lastSnapshotRef = useRef<RendererSnapshot | null>(null);

  // Skip dispatch when HTML output didn't change — avoids 60fps consumer churn.
  const lastHtmlRef = useRef<string>("");

  const refresh = useCallback(async () => {
    const slug = activeProjectSlug;
    if (!slug) return;

    try {
      const [rendererResult, filesResult] = await Promise.all([
        fetchTranspiledRenderer(slug),
        fetchWorkspaceFiles(slug),
      ]);

      const { renderFn, rawTheme } = await compileRenderer(rendererResult.js);
      const context: RenderContext = {
        files: filesResult.files,
        baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
        state: EMPTY_AGENT_STATE,
      };
      const html = renderFn(context);
      const theme = validateTheme(resolveRawTheme(rawTheme, context));
      lastSnapshotRef.current = { slug, files: filesResult.files, renderFn, rawTheme };
      lastHtmlRef.current = html;
      rendererViewDispatch({ type: "SET_OUTPUT", html, theme });
    } catch (e: unknown) {
      lastSnapshotRef.current = null;
      lastHtmlRef.current = "";
      if (e instanceof Error && e.message.includes("404")) {
        rendererViewDispatch({ type: "SET_OUTPUT", html: NOT_FOUND_HTML, theme: null });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        rendererViewDispatch({ type: "SET_OUTPUT", html: errorHtml(message), theme: null });
      }
    }
  }, [activeProjectSlug, rendererViewDispatch]);

  const refreshState = useCallback(() => {
    const slug = activeProjectSlug;
    if (!slug) return;
    const snap = lastSnapshotRef.current;
    if (!snap || snap.slug !== slug) return;

    try {
      const context: RenderContext = {
        files: snap.files,
        baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
        state: stateRef.current,
      };
      const html = snap.renderFn(context);
      const theme = validateTheme(resolveRawTheme(snap.rawTheme, context));
      if (html === lastHtmlRef.current) return;
      lastHtmlRef.current = html;
      rendererViewDispatch({ type: "SET_OUTPUT", html, theme });
    } catch {
      // Keep the last good HTML — otherwise a per-frame renderer throw
      // would flash an error screen during streaming.
    }
  }, [activeProjectSlug, rendererViewDispatch]);

  return { refresh, refreshState };
}
