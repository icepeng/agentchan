// Shared browser-side utilities for renderer.ts. No external dependencies —
// this keeps the fallback linker (which can't resolve node_modules) simple.
// Import from a renderer as: `import { escapeHtml } from "@agentchan/renderer-runtime"`.

import type { ProjectFile, TextFile } from "@agentchan/renderer-types";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape HTML special characters for safe insertion into text content or
 * attribute values. Produces a short output — preserves `/` and unicode.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Escape a string for use inside a `"..."` HTML attribute value.
 * Alias of escapeHtml — provided for intent clarity at call sites.
 */
export function escapeAttr(text: string): string {
  return escapeHtml(text);
}

/**
 * Lowercase ASCII slug for use as CSS class / id fragments derived from a
 * user-facing name. Non-ASCII characters are preserved to keep Korean names
 * readable; whitespace collapses to `-`.
 */
export function slugifyToken(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF]/g, "");
}

/** Narrow a ProjectFile to TextFile (type-guard). */
export function isTextFile(file: ProjectFile): file is TextFile {
  return file.type === "text";
}

/**
 * Convention: a file represents a character if its frontmatter defines a
 * `display-name` field. Renderers that adopt this convention can use this
 * guard instead of reimplementing the check.
 */
export function isCharacterFile(file: ProjectFile): file is TextFile {
  return (
    file.type === "text" &&
    typeof file.frontmatter?.["display-name"] === "string"
  );
}

/**
 * Convention: a file represents the user's persona if `role: persona` is set
 * in its frontmatter.
 */
export function isPersonaFile(file: ProjectFile): file is TextFile {
  return file.type === "text" && file.frontmatter?.role === "persona";
}

/**
 * Read a string field from a file's frontmatter, returning undefined when
 * missing or of the wrong type. Saves the `typeof` dance at call sites.
 */
export function frontmatterString(
  file: ProjectFile,
  key: string,
): string | undefined {
  if (file.type !== "text" || !file.frontmatter) return undefined;
  const value = file.frontmatter[key];
  return typeof value === "string" ? value : undefined;
}
