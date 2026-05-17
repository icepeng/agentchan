import type { ReactNode } from "react";

/**
 * Parse inline markdown (bold, italic, code, strikethrough) into React elements.
 * Handles nested formatting and gracefully ignores unclosed markers.
 *
 * Processing order matters — code first (protects inner content), then bold
 * before italic (longest match first), then strikethrough.
 */

// Matches inline code, bold, italic, strikethrough in one pass.
// Code backticks are matched first via alternation order so their inner
// content is never re-parsed for bold/italic.
const INLINE_RE =
  /(`[^`]+`)|(\*\*(?:[^*]|\*(?!\*))+\*\*)|(\*(?:[^*])+?\*)|(~~(?:[^~]|~(?!~))+~~)/g;

export function parseInlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const idx = match.index;

    // Push plain text before this match
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }

    const raw = match[0];

    if (match[1]) {
      // `code`
      parts.push(
        <code
          key={key++}
          className="font-mono bg-elevated/50 px-1 rounded text-[0.9em]"
        >
          {raw.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      // **bold** — recurse for nested italic/strike inside bold
      parts.push(
        <strong key={key++} className="font-semibold">
          {parseInlineMarkdown(raw.slice(2, -2))}
        </strong>,
      );
    } else if (match[3]) {
      // *italic* — recurse for nested strike inside italic
      parts.push(
        <em key={key++} className="italic">
          {parseInlineMarkdown(raw.slice(1, -1))}
        </em>,
      );
    } else if (match[4]) {
      // ~~strikethrough~~
      parts.push(
        <del key={key++} className="line-through opacity-60">
          {parseInlineMarkdown(raw.slice(2, -2))}
        </del>,
      );
    }

    lastIndex = idx + raw.length;
  }

  // Trailing plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If nothing matched, return the original string (avoids wrapping in array)
  return parts.length === 0 ? text : parts.length === 1 ? parts[0] : parts;
}
