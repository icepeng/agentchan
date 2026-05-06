import { createRenderer, type ProjectFile, type RendererActions, type RendererAgentState, type RendererProps, type TextFile } from "@agentchan/renderer/react";
import "./index.css";
import type { ReactElement } from "react";

type AgentState = RendererAgentState;

interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
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


function RendererContent({ files }: RendererContentProps): ReactElement {
  const contentFiles = files
    .filter((f): f is TextFile => f.type === "text" && !f.frontmatter)
    .sort((a, b) => a.path.localeCompare(b.path));

  if (contentFiles.length === 0) {
    return (
      <div className="dr-root">
        <div className="dr-empty">아직 출력 파일이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="dr-root">
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



function Renderer({ snapshot, actions }: RendererProps): ReactElement {
  return (
    <RendererContent
      files={[...snapshot.files]}
      baseUrl={snapshot.baseUrl}
      slug={snapshot.slug}
      state={snapshot.state}
      actions={actions}
    />
  );
}

export const renderer = createRenderer(Renderer);
