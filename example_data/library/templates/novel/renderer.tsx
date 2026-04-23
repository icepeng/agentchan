import type { ReactElement, ReactNode } from "react";

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

interface RendererActions {
  send(text: string): void;
  fill(text: string): void;
  setTheme(theme: unknown): void;
}

interface RendererProps {
  state: unknown;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

type InlineNode = string | ReactElement;

function renderInline(line: string): InlineNode[] {
  const parts: InlineNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`s-${idx++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={`e-${idx++}`}>{match[2]}</em>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts;
}

// Block-level token used by the markdown parser
type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "hr" }
  | { kind: "blockquote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "p"; lines: string[] };

function parseMarkdown(text: string): Block[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const rawBlocks = normalized.split(/\n\n+/);
  const blocks: Block[] = [];

  for (const rawBlock of rawBlocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Standalone heading or HR: only if block is a single line of that kind
    if (lines.length === 1) {
      const only = lines[0];
      const h3 = /^###\s+(.*)$/.exec(only);
      if (h3) {
        blocks.push({ kind: "h3", text: h3[1] });
        continue;
      }
      const h2 = /^##\s+(.*)$/.exec(only);
      if (h2) {
        blocks.push({ kind: "h2", text: h2[1] });
        continue;
      }
      const h1 = /^#\s+(.*)$/.exec(only);
      if (h1) {
        blocks.push({ kind: "h1", text: h1[1] });
        continue;
      }
      if (only.trim() === "---") {
        blocks.push({ kind: "hr" });
        continue;
      }
    }

    // Mixed blockquote-only block (all lines start with `>`)
    if (lines.every((l) => /^>\s*/.test(l))) {
      blocks.push({
        kind: "blockquote",
        lines: lines.map((l) => l.replace(/^>\s*/, "")),
      });
      continue;
    }

    // If block contains list items, split into alternating ul / non-list
    // segments. Non-list lines inside a mixed block become trailing <br/>
    // joined paragraph lines (matching legacy `<br/>` behavior).
    if (lines.some((l) => /^-\s+/.test(l))) {
      let buffer: string[] = [];
      let listItems: string[] = [];
      let inList = false;

      const flushBuffer = () => {
        if (buffer.length === 0) return;
        blocks.push({ kind: "p", lines: buffer });
        buffer = [];
      };
      const flushList = () => {
        if (listItems.length === 0) return;
        blocks.push({ kind: "ul", items: listItems });
        listItems = [];
      };

      for (const line of lines) {
        const li = /^-\s+(.*)$/.exec(line);
        if (li) {
          if (!inList) {
            flushBuffer();
            inList = true;
          }
          listItems.push(li[1]);
        } else {
          if (inList) {
            flushList();
            inList = false;
          }
          buffer.push(line);
        }
      }
      if (inList) flushList();
      else flushBuffer();
      continue;
    }

    // Default paragraph: preserve internal line breaks via <br/>
    blocks.push({ kind: "p", lines });
  }

  return blocks;
}

function renderMarkdown(text: string, keyPrefix: string): ReactElement[] {
  const blocks = parseMarkdown(text);
  return blocks.map((block, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (block.kind) {
      case "h1":
        return <h1 key={key}>{renderInline(block.text)}</h1>;
      case "h2":
        return <h2 key={key}>{renderInline(block.text)}</h2>;
      case "h3":
        return <h3 key={key}>{renderInline(block.text)}</h3>;
      case "hr":
        return <hr key={key} />;
      case "blockquote": {
        const nodes: ReactNode[] = [];
        block.lines.forEach((line, li) => {
          if (li > 0) nodes.push(<br key={`br-${li}`} />);
          nodes.push(
            <span key={`t-${li}`}>{renderInline(line)}</span>,
          );
        });
        return <blockquote key={key}>{nodes}</blockquote>;
      }
      case "ul":
        return (
          <ul key={key}>
            {block.items.map((item, li) => (
              <li key={li}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      case "p": {
        const nodes: ReactNode[] = [];
        block.lines.forEach((line, li) => {
          if (li > 0) nodes.push(<br key={`br-${li}`} />);
          nodes.push(
            <span key={`t-${li}`}>{renderInline(line)}</span>,
          );
        });
        return <p key={key}>{nodes}</p>;
      }
    }
  });
}

const STYLES = `
  .rb-layout {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  /* ── Tab System ── */
  .rb-tab-radio {
    display: none;
  }
  .rb-tabs-header {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-bottom: 32px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
    padding: 0 8px;
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--color-void);
  }
  .rb-tab-label {
    padding: 12px 4px;
    cursor: pointer;
    color: var(--color-fg-3);
    font-family: var(--font-family-display);
    font-weight: 600;
    font-size: 15px;
    border-bottom: 2px solid transparent;
    transition: color 0.2s ease, border-color 0.2s ease;
    margin-bottom: -1px;
    user-select: none;
    white-space: nowrap;
  }
  .rb-tab-label:hover {
    color: var(--color-fg);
  }

  #tab-novel:checked ~ .rb-tabs-header label[for="tab-novel"],
  #tab-outline:checked ~ .rb-tabs-header label[for="tab-outline"],
  #tab-world:checked ~ .rb-tabs-header label[for="tab-world"],
  #tab-chars:checked ~ .rb-tabs-header label[for="tab-chars"] {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  /* ── Tab Content Visibility ── */
  .rb-tab-content {
    display: none;
    animation: rb-fadeIn 0.3s ease;
  }
  @keyframes rb-fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  #tab-novel:checked ~ .rb-content-novel { display: block; }
  #tab-outline:checked ~ .rb-content-outline { display: block; }
  #tab-world:checked ~ .rb-content-world { display: block; }
  #tab-chars:checked ~ .rb-content-chars { display: block; }

  /* ── Empty State ── */
  .rb-empty {
    color: var(--color-fg-4);
    font-size: 14px;
    font-family: var(--font-family-mono);
    text-align: center;
    padding: 48px 0;
  }

  /* ── Prose Area (Novel, Outline, World) ── */
  .rb-prose {
    max-width: 680px;
    margin: 0 auto;
    line-height: 1.8;
    font-size: 15px;
    color: var(--color-fg);
    font-family: var(--font-family-body);
    padding-bottom: 64px;
  }
  .rb-prose h1 {
    font-size: 1.5em;
    font-family: var(--font-family-display);
    font-weight: 700;
    color: var(--color-fg);
    margin: 48px 0 20px;
  }
  .rb-prose h2 {
    font-size: 1.25em;
    font-family: var(--font-family-display);
    font-weight: 700;
    color: var(--color-fg);
    margin: 40px 0 16px;
  }
  .rb-prose h3 {
    font-size: 1.125em;
    font-family: var(--font-family-display);
    font-weight: 600;
    color: var(--color-fg);
    margin: 32px 0 12px;
  }
  .rb-prose hr {
    margin: 40px 0;
    text-align: center;
    border: none;
    color: var(--color-fg-4);
    font-size: 1.125em;
    letter-spacing: 0.5em;
  }
  .rb-prose hr::after {
    content: "***";
  }
  .rb-prose blockquote {
    border-left: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent) 3%, transparent);
    padding: 16px 20px;
    margin: 24px 0;
    color: var(--color-fg-2);
    border-radius: 0 8px 8px 0;
    font-size: 0.95em;
  }
  .rb-prose p {
    margin-bottom: 16px;
  }
  .rb-prose ul {
    margin-bottom: 16px;
    padding-left: 24px;
    color: var(--color-fg-2);
  }
  .rb-prose li {
    margin-bottom: 6px;
  }
  .rb-prose strong {
    font-weight: 600;
    color: var(--color-fg);
  }
  .rb-prose em {
    color: var(--color-fg-2);
  }
  .rb-file-separator {
    height: 1px;
    background: color-mix(in srgb, var(--color-edge) 8%, transparent);
    margin: 64px auto;
    width: 60%;
  }

  /* ── Characters Cards Area ── */
  .rb-chars {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-bottom: 64px;
  }
  .rb-char-card {
    background: var(--color-surface);
    border: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
    border-radius: 12px;
    padding: 32px;
    font-family: var(--font-family-body);
  }
  .rb-char-card h1 {
    font-family: var(--font-family-display);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-accent);
    margin: 0 0 16px 0;
    padding-bottom: 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
  }
  .rb-char-card h2 {
    font-family: var(--font-family-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-fg);
    margin: 24px 0 12px 0;
  }
  .rb-char-card h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-fg);
    margin: 16px 0 8px 0;
  }
  .rb-char-card p {
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.6;
    margin-bottom: 12px;
  }
  .rb-char-card ul {
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.6;
    margin: 0 0 16px 0;
    padding-left: 20px;
  }
  .rb-char-card li {
    margin-bottom: 6px;
  }
  .rb-char-card strong {
    color: var(--color-fg);
    font-weight: 600;
  }
  .rb-char-card hr {
    border: none;
    border-top: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
    margin: 24px 0;
  }
  .rb-char-card blockquote {
    border-left: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    padding-left: 16px;
    margin: 16px 0;
    color: var(--color-fg-2);
    font-style: italic;
    font-size: 14px;
  }
`;

function ProseSection({
  files,
  emptyMessage,
  keyPrefix,
}: {
  files: TextFile[];
  emptyMessage: string;
  keyPrefix: string;
}): ReactElement {
  if (files.length === 0) {
    return <div className="rb-empty">{emptyMessage}</div>;
  }
  return (
    <>
      {files.map((f, i) => (
        <div key={f.path}>
          {i > 0 ? <div className="rb-file-separator" /> : null}
          <div>{renderMarkdown(f.content, `${keyPrefix}-${i}`)}</div>
        </div>
      ))}
    </>
  );
}

export default function Renderer({ files }: RendererProps): ReactElement {
  const textFiles = files.filter((f): f is TextFile => f.type === "text");

  if (textFiles.length === 0) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="rb-empty">아직 출력 파일이 없습니다</div>
      </>
    );
  }

  const isChar = (p: string) => /character|캐릭터|인물/i.test(p);
  const isWorld = (p: string) => /world|setting|lore|세계관|설정/i.test(p);
  const isOutline = (p: string) =>
    /outline|plot|synopsis|아웃라인|플롯|시놉시스/i.test(p);

  const charsFiles = textFiles.filter((f) => isChar(f.path));
  const worldFiles = textFiles.filter(
    (f) => !isChar(f.path) && isWorld(f.path),
  );
  const outlineFiles = textFiles.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && isOutline(f.path),
  );
  const novelFiles = textFiles.filter(
    (f) => !isChar(f.path) && !isWorld(f.path) && !isOutline(f.path),
  );

  charsFiles.sort((a, b) => a.path.localeCompare(b.path));
  worldFiles.sort((a, b) => a.path.localeCompare(b.path));
  outlineFiles.sort((a, b) => a.path.localeCompare(b.path));
  novelFiles.sort((a, b) => a.path.localeCompare(b.path));

  let defaultTab: "novel" | "outline" | "world" | "chars" = "novel";
  if (novelFiles.length > 0) defaultTab = "novel";
  else if (outlineFiles.length > 0) defaultTab = "outline";
  else if (worldFiles.length > 0) defaultTab = "world";
  else if (charsFiles.length > 0) defaultTab = "chars";

  return (
    <>
      <style>{STYLES}</style>
      <div className="rb-layout">
        {/* Hidden CSS-only tab states */}
        <input
          type="radio"
          id="tab-novel"
          name="rb-tabs"
          defaultChecked={defaultTab === "novel"}
          className="rb-tab-radio"
        />
        <input
          type="radio"
          id="tab-outline"
          name="rb-tabs"
          defaultChecked={defaultTab === "outline"}
          className="rb-tab-radio"
        />
        <input
          type="radio"
          id="tab-world"
          name="rb-tabs"
          defaultChecked={defaultTab === "world"}
          className="rb-tab-radio"
        />
        <input
          type="radio"
          id="tab-chars"
          name="rb-tabs"
          defaultChecked={defaultTab === "chars"}
          className="rb-tab-radio"
        />

        {/* Tab Controls */}
        <div className="rb-tabs-header">
          <label htmlFor="tab-novel" className="rb-tab-label">
            이야기
          </label>
          <label htmlFor="tab-outline" className="rb-tab-label">
            아웃라인
          </label>
          <label htmlFor="tab-world" className="rb-tab-label">
            세계 설정
          </label>
          <label htmlFor="tab-chars" className="rb-tab-label">
            캐릭터
          </label>
        </div>

        {/* Novel Scroll Area */}
        <div className="rb-tab-content rb-content-novel">
          <div className="rb-prose">
            <ProseSection
              files={novelFiles}
              emptyMessage="아직 작성된 챕터가 없습니다."
              keyPrefix="novel"
            />
          </div>
        </div>

        {/* Outline Scroll Area */}
        <div className="rb-tab-content rb-content-outline">
          <div className="rb-prose">
            <ProseSection
              files={outlineFiles}
              emptyMessage="아직 아웃라인이 없습니다."
              keyPrefix="outline"
            />
          </div>
        </div>

        {/* World Setting Scroll Area */}
        <div className="rb-tab-content rb-content-world">
          <div className="rb-prose">
            <ProseSection
              files={worldFiles}
              emptyMessage="아직 세계 설정이 없습니다."
              keyPrefix="world"
            />
          </div>
        </div>

        {/* Characters Scroll Area */}
        <div className="rb-tab-content rb-content-chars">
          <div className="rb-chars">
            {charsFiles.length === 0 ? (
              <div className="rb-empty">아직 캐릭터가 없습니다.</div>
            ) : (
              charsFiles.map((f, i) => (
                <div key={f.path} className="rb-char-card">
                  {renderMarkdown(f.content, `char-${i}`)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
