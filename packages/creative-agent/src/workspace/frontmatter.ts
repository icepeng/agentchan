import { parse as parseYaml } from "yaml";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
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
