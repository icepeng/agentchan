import type { ReactNode } from "react";
import { parseInlineMarkdown } from "./inlineMarkdown.js";

export interface ReadmeDoc {
  frontmatter: { name?: string; description?: string };
  body: string;
}

interface ReadmeViewProps {
  doc: ReadmeDoc;
  variant?: "hero" | "compact";
  coverUrl?: string;
  orderNumber?: string;
  fallbackName?: string;
}

/**
 * Render a parsed README document in two editorial styles:
 *
 * - `hero` — oversized display title split across two lines, accent bar,
 *   description, optional cover, ornament separator, then body. Used on the
 *   TemplatesPage "The Library" right pane.
 * - `compact` — single-line title, description, body. Used in the in-project
 *   README modal where space is tighter and cover art is skipped.
 */
export function ReadmeView({
  doc,
  variant = "hero",
  coverUrl,
  orderNumber,
  fallbackName,
}: ReadmeViewProps) {
  const name = doc.frontmatter.name ?? fallbackName ?? "";
  const description = doc.frontmatter.description;
  const body = doc.body.trim();

  if (variant === "compact") {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg text-balance">
          {name}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-fg-2 leading-relaxed text-pretty">{description}</p>
        )}
        <div className="mt-5">
          {body ? parseBlockMarkdown(body) : null}
        </div>
      </div>
    );
  }

  // hero variant
  return (
    <div>
      <HeroTitle name={name} />
      <div className="w-16 h-1 bg-accent my-5" aria-hidden />
      {description && (
        <p className="text-fg-2 text-base leading-relaxed text-pretty">
          {description}
        </p>
      )}
      {coverUrl && (
        <div className="mt-8 w-full aspect-[21/9] rounded-2xl overflow-hidden border border-edge/8 bg-gradient-to-br from-accent/8 to-transparent">
          <img
            src={coverUrl}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      {body && (
        <>
          <Separator orderNumber={orderNumber} />
          <div className="readme-body">{parseBlockMarkdown(body)}</div>
        </>
      )}
    </div>
  );
}

/** Split the title on the first whitespace so the hero stacks on two lines. */
function HeroTitle({ name }: { name: string }) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const spaceIdx = trimmed.indexOf(" ");
  const firstLine = spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
  const secondLine = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1) : null;
  return (
    <h1 className="font-display font-bold tracking-tight leading-[0.95] text-5xl md:text-6xl text-fg uppercase text-balance">
      <span className="block">{firstLine}</span>
      {secondLine && <span className="block">{secondLine}</span>}
    </h1>
  );
}

function Separator({ orderNumber }: { orderNumber?: string }) {
  return (
    <div className="mt-10 mb-2 flex items-center gap-3 text-[10px] text-fg-4 font-mono uppercase tracking-[0.2em]">
      <span className="border-t border-edge/8 w-8" aria-hidden />
      <span>{orderNumber ?? "—"}</span>
      <span className="border-t border-edge/8 flex-1" aria-hidden />
    </div>
  );
}

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" }
  | { type: "code"; text: string };

function tokenize(source: string): Block[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3;
      blocks.push({ type: `h${level}`, text: heading[2]!.trim() });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!;
      if (
        l.trim() === "" ||
        /^---+\s*$/.test(l) ||
        /^```/.test(l) ||
        /^#{1,3}\s/.test(l) ||
        /^[-*]\s/.test(l) ||
        /^\d+\.\s/.test(l)
      ) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "p", text: paraLines.join(" ").trim() });
    }
  }

  return blocks;
}

function parseBlockMarkdown(source: string): ReactNode {
  return tokenize(source).map((block, i) => {
    switch (block.type) {
      case "h1":
        return (
          <h1
            key={i}
            className="font-display text-2xl font-bold tracking-tight mt-10 mb-3 first:mt-0 text-fg text-balance"
          >
            {parseInlineMarkdown(block.text)}
          </h1>
        );
      case "h2":
        return (
          <h2
            key={i}
            className="font-display text-lg font-semibold mt-8 mb-2 text-fg text-balance"
          >
            {parseInlineMarkdown(block.text)}
          </h2>
        );
      case "h3":
        return (
          <h3 key={i} className="text-base font-semibold mt-6 mb-2 text-fg-2 text-balance">
            {parseInlineMarkdown(block.text)}
          </h3>
        );
      case "p":
        return (
          <p key={i} className="my-3 text-fg-2 leading-relaxed text-pretty">
            {parseInlineMarkdown(block.text)}
          </p>
        );
      case "ul":
        return (
          <ul key={i} className="my-3 space-y-1.5 list-disc list-outside pl-5 text-fg-2 leading-relaxed text-pretty">
            {block.items.map((item, j) => (
              <li key={j}>{parseInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={i} className="my-3 space-y-1.5 list-decimal list-outside pl-5 text-fg-2 leading-relaxed text-pretty">
            {block.items.map((item, j) => (
              <li key={j}>{parseInlineMarkdown(item)}</li>
            ))}
          </ol>
        );
      case "hr":
        return <hr key={i} className="my-8 border-t border-edge/8" />;
      case "code":
        return (
          <pre
            key={i}
            className="my-4 p-3 bg-elevated/60 border border-edge/6 rounded-lg font-mono text-xs overflow-x-auto text-fg-3 leading-relaxed"
          >
            <code>{block.text}</code>
          </pre>
        );
    }
  });
}
