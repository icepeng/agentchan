import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

/**
 * Serialize a `{ frontmatter, body }` pair back into a markdown string.
 *
 * Frontmatter keys with `undefined` values are dropped so callers can pass
 * partial metadata without pre-filtering. When the frontmatter map is empty,
 * the delimiters are omitted entirely — the output is just the body.
 */
export function stringifyFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) cleaned[key] = value;
  }
  const keys = Object.keys(cleaned);
  const normalizedBody = body.startsWith("\n") ? body : body.length > 0 ? "\n" + body : "";
  if (keys.length === 0) return body;
  const yamlBlock = stringifyYaml(cleaned).trimEnd();
  return `---\n${yamlBlock}\n---\n${normalizedBody}`;
}

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Expects the standard `---\n{yaml}\n---\n{body}` format.
 * Returns `{ frontmatter: null, body: original }` if no frontmatter found.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = content.replace(/\r/g, "");

  // Full frontmatter + body
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (match) {
    return parseYamlBlock(match[1], match[2]);
  }

  // Frontmatter only (no body after closing ---)
  const fmOnly = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*$/);
  if (fmOnly) {
    return parseYamlBlock(fmOnly[1], "");
  }

  return { frontmatter: null, body: normalized };
}

function parseYamlBlock(
  yamlStr: string,
  body: string,
): ParsedFrontmatter {
  try {
    const parsed = parseYaml(yamlStr) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { frontmatter: parsed as Record<string, unknown>, body };
    }
  } catch {
    // Malformed YAML — treat as no frontmatter
  }
  return { frontmatter: null, body };
}
