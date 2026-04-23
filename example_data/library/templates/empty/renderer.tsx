import type { ReactElement } from "react";

interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

interface DataFile {
  type: "data";
  path: string;
  content: string;
  data: unknown;
  format: "yaml" | "json";
  modifiedAt: number;
}

interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

type ProjectFile = TextFile | DataFile | BinaryFile;

interface RendererProps {
  files: ProjectFile[];
  baseUrl: string;
  slug: string;
  state: unknown;
  actions: unknown;
}

function renderBasicMarkdown(text: string): ReactElement[] {
  const nodes: ReactElement[] = [];
  const lines = text.split("\n");
  let buffer: string[] = [];

  const flushParagraph = (key: string) => {
    if (buffer.length === 0) return;
    nodes.push(
      <p key={key} className="dr-body">
        {buffer.map((line, i) => (
          <span key={i}>
            {renderInline(line)}
            {i < buffer.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
    buffer = [];
  };

  lines.forEach((line, i) => {
    if (line.trim() === "---") {
      flushParagraph(`p-${i}`);
      nodes.push(<hr key={`hr-${i}`} className="dr-hr" />);
      return;
    }
    buffer.push(line);
  });
  flushParagraph("p-last");

  return nodes;
}

function renderInline(line: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={idx++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={idx++}>{match[2]}</em>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts;
}

const STYLES = `
  .dr-empty { color: var(--color-fg-3); font-size: 14px; font-family: var(--font-family-mono); text-align: center; padding: 48px 0; }
  .dr-sep { margin: 32px 0; border: none; border-top: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent); }
  .dr-hr { margin: 24px 0; border: none; border-top: 1px solid color-mix(in srgb, var(--color-edge) 8%, transparent); }
  .dr-path { font-size: 11px; font-family: var(--font-family-mono); color: var(--color-fg-3); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .dr-body { white-space: pre-wrap; word-break: break-word; line-height: 1.625; font-size: 14px; color: var(--color-fg); }
  .dr-root { max-width: 720px; margin: 0 auto; padding: 24px; }
`;

export default function Renderer({ files }: RendererProps): ReactElement {
  const contentFiles = files
    .filter((f): f is TextFile => f.type === "text" && !f.frontmatter)
    .sort((a, b) => a.path.localeCompare(b.path));

  if (contentFiles.length === 0) {
    return (
      <div className="dr-root">
        <style>{STYLES}</style>
        <div className="dr-empty">아직 출력 파일이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="dr-root">
      <style>{STYLES}</style>
      {contentFiles.map((file, i) => (
        <section key={file.path}>
          {i > 0 ? <hr className="dr-sep" /> : null}
          <div className="dr-path">{file.path}</div>
          <div>{renderBasicMarkdown(file.content)}</div>
        </section>
      ))}
    </div>
  );
}
