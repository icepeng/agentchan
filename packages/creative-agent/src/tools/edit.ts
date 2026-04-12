import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";

const EditParams = Type.Object({
  file_path: Type.String({
    description: "Absolute or relative path to the file to edit",
  }),
  old_string: Type.String({
    description:
      "The exact string to find and replace. Must be unique in the file — include surrounding context if needed to disambiguate.",
  }),
  new_string: Type.String({
    description: "The replacement string",
  }),
});

type EditInput = Static<typeof EditParams>;

/**
 * Count non-overlapping occurrences of `needle` in `haystack` using indexOf.
 * Avoids allocating an array of split fragments.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// Normalize unicode variations so fuzzy matching can ignore smart quotes,
// special dashes, non-breaking spaces, and trailing whitespace differences.
function normalizeForFuzzyMatch(text: string): string {
  return (
    text
      .normalize("NFKC")
      // Smart quotes → ASCII
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      // Unicode dashes → hyphen
      .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
      // Special spaces → regular space
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
      // Trim trailing whitespace per line
      .replace(/[^\S\n]+$/gm, "")
  );
}

function findMatch(content: string, search: string): { match: string; count: number; fuzzy: boolean } {
  const exactCount = countOccurrences(content, search);
  if (exactCount > 0) return { match: search, count: exactCount, fuzzy: false };

  const normContent = normalizeForFuzzyMatch(content);
  const normSearch = normalizeForFuzzyMatch(search);
  if (normSearch.length === 0) return { match: search, count: 0, fuzzy: false };

  const fuzzyCount = countOccurrences(normContent, normSearch);
  if (fuzzyCount === 0) return { match: search, count: 0, fuzzy: false };

  // If normalization preserved string length, index mapping is trivial
  const normIndex = normContent.indexOf(normSearch);
  if (normContent.length === content.length) {
    return {
      match: content.slice(normIndex, normIndex + normSearch.length),
      count: fuzzyCount,
      fuzzy: true,
    };
  }

  // Lengths differ — build per-character index mapping (reuse normContent)
  const mapped = mapNormalizedIndex(content, normContent, normIndex, normSearch.length);
  if (mapped === null) return { match: search, count: 0, fuzzy: false };
  return { match: mapped, count: fuzzyCount, fuzzy: true };
}

// Normalize a single character through the same transforms as normalizeForFuzzyMatch.
// Returns the normalized result (may be empty if the char would be trimmed, or
// multi-char if NFKC expands it). Uses direct character code checks instead of
// regex to avoid running line-oriented patterns on individual characters.
function normalizeChar(ch: string): string {
  const code = ch.charCodeAt(0);

  // Smart double quotes -> "
  if (code === 0x201C || code === 0x201D || code === 0x201E ||
      code === 0x201F || code === 0x2033 || code === 0x2036) return '"';
  // Smart single quotes -> '
  if (code === 0x2018 || code === 0x2019 || code === 0x201A ||
      code === 0x201B || code === 0x2032 || code === 0x2035) return "'";
  // Unicode dashes -> -
  if (code === 0x2013 || code === 0x2014 || code === 0x2015 || code === 0x2212) return "-";
  // Special spaces -> regular space
  if (code === 0x00A0 || (code >= 0x2000 && code <= 0x200B) ||
      code === 0x202F || code === 0x205F || code === 0x3000) return " ";

  // NFKC may expand (e.g. ligatures) or change the character
  return ch.normalize("NFKC");
}

// Map a range in normalized text back to the original text by walking both
// strings in parallel. Returns the original substring, or null if mapping fails.
function mapNormalizedIndex(
  original: string,
  normalized: string,
  normStart: number,
  normLen: number,
): string | null {
  let origIdx = 0;
  let normIdx = 0;
  let startOrig = -1;
  const normEnd = normStart + normLen;

  while (origIdx < original.length && normIdx <= normEnd) {
    if (normIdx === normStart) startOrig = origIdx;
    if (normIdx === normEnd) {
      return startOrig === -1 ? null : original.slice(startOrig, origIdx);
    }

    // Determine how many normalized chars this original char produces.
    // normalizeChar handles all 1:1 replacements and NFKC expansions.
    // Characters deleted by trailing-whitespace trimming produce length 0;
    // we detect this by comparing against the actual normalized string.
    const normOfChar = normalizeChar(original[origIdx]);
    if (normOfChar.length > 0 && normIdx + normOfChar.length <= normalized.length &&
        normalized.slice(normIdx, normIdx + normOfChar.length) === normOfChar) {
      normIdx += normOfChar.length;
    }
    // else: character was deleted (e.g. trailing whitespace trimmed) — normIdx stays

    origIdx++;
  }

  if (startOrig === -1) return null;
  if (normIdx === normEnd) return original.slice(startOrig, origIdx);
  return original.slice(startOrig);
}

/** Extract a snippet of the file for error messages, using indexOf to find the Nth newline. */
function fileSnippet(content: string, maxLines = 30): string {
  let pos = -1;
  for (let i = 0; i < maxLines; i++) {
    const next = content.indexOf("\n", pos + 1);
    if (next === -1) return content; // file has fewer lines than maxLines
    pos = next;
  }
  // Count remaining lines
  let remaining = 0;
  let scan = pos;
  while ((scan = content.indexOf("\n", scan + 1)) !== -1) remaining++;
  if (content.length > 0 && content[content.length - 1] !== "\n") remaining++;
  return content.slice(0, pos) + `\n... (${remaining} more lines)`;
}

const DESCRIPTION = `Edit a file by replacing old_string with new_string. The old_string must match exactly and be unique in the file.

Guidelines:
- Read the file first before editing — do not guess the content from memory.
- old_string must match the file content exactly, including whitespace and newlines.
- Keep old_string as small as possible while still being unique in the file.
- When changing multiple separate sections, make separate edit calls for each.
- For appending content, use append instead.`;

export function createEditTool(cwd?: string): AgentTool<typeof EditParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "edit",
    description: DESCRIPTION,
    parameters: EditParams,
    label: "Edit file",

    async execute(
      _toolCallId: string,
      params: EditInput,
    ): Promise<AgentToolResult<void>> {
      const filePath = resolve(workDir, params.file_path);
      const content = await readFile(filePath, "utf-8");

      const { match, count, fuzzy } = findMatch(content, params.old_string);

      if (count === 0) {
        const snippet = fileSnippet(content);
        throw new Error(
          `old_string not found in file. The old_string must match the file content exactly (including whitespace and newlines). ` +
            `Read the file first to get the exact text.\n\nCurrent file content:\n${snippet}`,
        );
      }
      if (count > 1) {
        throw new Error(
          `old_string matches ${count} locations — provide more surrounding context to make it unique`,
        );
      }

      const updated = content.replace(match, params.new_string);
      await writeFile(filePath, updated, "utf-8");
      return textResult(fuzzy ? "File edited successfully (fuzzy matched)." : "File edited successfully.");
    },
  };
}
