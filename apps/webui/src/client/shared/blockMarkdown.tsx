import type { ReactNode } from "react";
import { parseInlineMarkdown } from "./inlineMarkdown.js";

/**
 * Minimal block-level markdown → React renderer for editorial README pages.
 *
 * Supports: H1-H3, paragraphs, unordered/ordered lists, horizontal rules,
 * fenced code blocks. Inline formatting is delegated to `parseInlineMarkdown`.
 *
 * Does NOT support tables, blockquotes, images, nested lists, or links —
 * these are intentionally omitted to keep the renderer small and predictable
 * for README content authored by end users.
 */

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

    if (line.trim() === "") { i++; continue; }

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
      // Skip closing fence if present
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

    // Paragraph: consume consecutive non-block lines
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

export function parseBlockMarkdown(source: string): ReactNode {
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
