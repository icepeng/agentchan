// ─────────────────────────────────────────────────────────────────────────────
//   empty renderer  ·  plain text file list
//
//   iframe 격리된 렌더러 — mount(container, ctx)로 부팅하고 subscribeFiles로
//   파일 변경을 받아 innerHTML로 교체한다.
// ─────────────────────────────────────────────────────────────────────────────

// --- Contract (inline — renderer는 독립 transpile이라 타입 import 불가) -----

interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

type ProjectFile = TextFile | BinaryFile;

interface AgentState {
  messages: ReadonlyArray<unknown>;
  streamingMessage?: unknown;
  pendingToolCalls: ReadonlySet<string>;
  isStreaming: boolean;
}

interface RendererAction {
  type: "send" | "fill";
  text: string;
}

interface RendererThemeTokens {
  void?: string;
  base?: string;
  surface?: string;
  elevated?: string;
  accent?: string;
  fg?: string;
  fg2?: string;
  fg3?: string;
  edge?: string;
}

interface RendererTheme {
  base: RendererThemeTokens;
  dark?: Partial<RendererThemeTokens>;
  prefersScheme?: "light" | "dark";
}

interface RendererHostApi {
  sendAction(action: RendererAction): void;
  setTheme(theme: RendererTheme | null): void;
  subscribeState(cb: (state: AgentState) => void): () => void;
  subscribeFiles(cb: (files: ProjectFile[]) => void): () => void;
  readonly version: 1;
}

interface MountContext {
  files: ProjectFile[];
  baseUrl: string;
  assetsUrl: string;
  state: AgentState;
  host: RendererHostApi;
}

interface RendererHandle {
  destroy(): void;
}

// 내부 pure 렌더링 단위. mount가 MountContext에서 뽑아 넘긴다.
interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderBasicMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, '<hr class="dr-hr" />')
    .replace(/\n/g, "<br />");
}

const STYLES = `<style>
  .dr-empty { color: var(--color-fg-4); font-size: 14px; font-family: var(--font-family-mono); text-align: center; padding: 48px 0; }
  .dr-sep { margin: 32px 0; border: none; border-top: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent); }
  .dr-hr { margin: 24px 0; border: none; border-top: 1px solid color-mix(in srgb, var(--color-edge) 8%, transparent); }
  .dr-path { font-size: 11px; font-family: var(--font-family-mono); color: var(--color-fg-4); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .dr-body { white-space: pre-wrap; word-break: break-word; line-height: 1.625; font-size: 14px; color: var(--color-fg); }
</style>`;

function renderPlaceholder(ctx: RenderContext): string {
  // Show all text files that don't have frontmatter (exclude character/world definitions)
  const contentFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && !f.frontmatter,
  );
  if (contentFiles.length === 0) {
    return `${STYLES}<div class="dr-empty">아직 출력 파일이 없습니다</div>`;
  }

  const inner = contentFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file, i) => {
      const separator = i > 0 ? '<hr class="dr-sep" />' : "";
      const header = `<div class="dr-path">${escapeHtml(file.path)}</div>`;
      const body = `<div class="dr-body">${renderBasicMarkdown(file.content)}</div>`;
      return `${separator}${header}${body}`;
    })
    .join("\n");

  return `${STYLES}${inner}`;
}

// ── Mount ───────────────────────────────────────────────────────────────────

export function mount(container: HTMLElement, ctx: MountContext): RendererHandle {
  let files = ctx.files;
  let lastHtml = "";

  function paint() {
    const html = renderPlaceholder({ files, baseUrl: ctx.baseUrl });
    if (html === lastHtml) return;
    lastHtml = html;
    container.innerHTML = html;
  }

  paint();

  const unsubFiles = ctx.host.subscribeFiles((next) => {
    files = next;
    paint();
  });

  return {
    destroy() {
      unsubFiles();
      container.innerHTML = "";
    },
  };
}
