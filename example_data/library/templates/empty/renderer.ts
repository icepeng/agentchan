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

export function render(ctx: RenderContext): string {
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
