import { useCallback, useRef } from "react";
import {
  useProjectState,
  useProjectDispatch,
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
  validateTheme,
  resolveRawTheme,
} from "@/client/entities/project/index.js";
import type {
  ProjectFile,
  RenderContext,
  RenderPendingState,
} from "@/client/entities/project/index.js";

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

// 렌더러 JS를 module로 import하여 render 함수와 raw theme export를 추출한다.
// theme은 객체 또는 `(ctx) => theme` 함수 양쪽을 지원하므로, 이 단계에서는 검증하지 않고
// 원본 값을 보존한다. 실제 테마 오브젝트는 refresh/refreshPending이 각자 context로
// `resolveRawTheme` → `validateTheme`을 호출해 매 프레임 최신 파일 상태를 반영한다.
//
// 한 번 import한 module은 메모리에 남아 renderFn/rawTheme 클로저로 이후 호출이 가능하므로
// Blob URL을 즉시 revoke해도 안전하다. rAF 루프에서 반복 import하지 않기 위해
// snapshot에 renderFn과 rawTheme을 저장해 재사용한다.
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
  const projectState = useProjectState();
  const projectDispatch = useProjectDispatch();

  // Stream 중 refreshPending이 fetch/재컴파일 없이 재사용할 최근 성공 스냅샷.
  // files 내용이 스트리밍 중 실제로 바뀌어도 STREAM_COMPLETE 시 full refresh가
  // 다시 돌아 스냅샷이 갱신된다.
  const lastSnapshotRef = useRef<RendererSnapshot | null>(null);

  // rAF 루프가 같은 HTML을 반복 dispatch하면 Context 소비자 전체가 60fps로
  // 재렌더되므로, 직전에 내보낸 HTML과 동일하면 dispatch를 건너뛴다.
  const lastHtmlRef = useRef<string>("");

  const refresh = useCallback(async () => {
    const slug = projectState.activeProjectSlug;
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
      };
      const html = renderFn(context);
      const theme = validateTheme(resolveRawTheme(rawTheme, context));
      lastSnapshotRef.current = { slug, files: filesResult.files, renderFn, rawTheme };
      lastHtmlRef.current = html;
      projectDispatch({ type: "SET_RENDER_OUTPUT", html, theme });
    } catch (e: unknown) {
      lastSnapshotRef.current = null;
      lastHtmlRef.current = "";
      if (e instanceof Error && e.message.includes("404")) {
        projectDispatch({ type: "SET_RENDER_OUTPUT", html: NOT_FOUND_HTML, theme: null });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        projectDispatch({ type: "SET_RENDER_OUTPUT", html: errorHtml(message), theme: null });
      }
    }
  }, [projectState.activeProjectSlug, projectDispatch]);

  const refreshPending = useCallback(
    (pending: RenderPendingState) => {
      const slug = projectState.activeProjectSlug;
      if (!slug) return;
      const snap = lastSnapshotRef.current;
      if (!snap || snap.slug !== slug) return;

      try {
        const context: RenderContext = {
          files: snap.files,
          baseUrl: `/api/projects/${encodeURIComponent(slug)}`,
          pending,
        };
        const html = snap.renderFn(context);
        const theme = validateTheme(resolveRawTheme(snap.rawTheme, context));
        if (html === lastHtmlRef.current) return;
        lastHtmlRef.current = html;
        projectDispatch({ type: "SET_RENDER_OUTPUT", html, theme });
      } catch {
        // 스트리밍 중 렌더러 에러는 조용히 무시 — 기존 HTML을 유지해야
        // 사용자가 매 프레임 error screen을 보지 않는다.
      }
    },
    [projectState.activeProjectSlug, projectDispatch],
  );

  return { refresh, refreshPending };
}
