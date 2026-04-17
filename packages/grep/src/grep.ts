import { resolve, basename } from "node:path";
import { stat } from "node:fs/promises";
import { DEFAULT_MAX_FILE_SIZE, type GrepOptions, type GrepMatch, type GrepResult } from "./types.js";
import { walkFiles } from "./walker.js";

export type { GrepOptions, GrepMatch, GrepResult };

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const DEFAULT_MAX_MATCHES = 100;

function buildRegex(pattern: string, options: GrepOptions): RegExp {
  let source = pattern;
  if (options.literal) {
    source = source.replace(REGEX_SPECIAL, "\\$&");
  }
  const flags = options.ignoreCase ? "i" : "";
  return new RegExp(source, flags);
}

/** Check first 8KB of content string for null bytes (binary indicator). */
function isBinaryContent(content: string): boolean {
  const check = content.length > 8192 ? content.slice(0, 8192) : content;
  return check.includes("\0");
}

/**
 * Search a single file's content for matches.
 * Returns match entries including context lines if requested.
 */
function searchFileContent(
  content: string,
  regex: RegExp,
  filePath: string,
  contextSize: number,
  maxMatches: number,
  currentMatchCount: number,
): { entries: GrepMatch[]; matchCount: number; truncated: boolean } {
  const lines = content.split(/\r?\n/);
  const matchLineNumbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (regex.test(line)) {
      matchLineNumbers.push(i + 1);
      if (currentMatchCount + matchLineNumbers.length >= maxMatches) {
        break;
      }
    }
  }

  if (matchLineNumbers.length === 0) {
    return { entries: [], matchCount: 0, truncated: false };
  }

  const truncated =
    currentMatchCount + matchLineNumbers.length >= maxMatches;

  if (contextSize === 0) {
    const entries: GrepMatch[] = matchLineNumbers.map((lineNum) => ({
      path: filePath,
      lineNumber: lineNum,
      text: lines[lineNum - 1] ?? "",
      isContext: false,
    }));
    return { entries, matchCount: matchLineNumbers.length, truncated };
  }

  // With context: build ranges and merge overlapping ones
  const matchSet = new Set(matchLineNumbers);
  const ranges: Array<{ start: number; end: number }> = [];

  for (const lineNum of matchLineNumbers) {
    const start = Math.max(1, lineNum - contextSize);
    const end = Math.min(lines.length, lineNum + contextSize);

    const lastRange = ranges[ranges.length - 1];
    if (lastRange && start <= lastRange.end + 1) {
      lastRange.end = Math.max(lastRange.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  const entries: GrepMatch[] = [];
  for (const range of ranges) {
    for (let lineNum = range.start; lineNum <= range.end; lineNum++) {
      entries.push({
        path: filePath,
        lineNumber: lineNum,
        text: lines[lineNum - 1] ?? "",
        isContext: !matchSet.has(lineNum),
      });
    }
  }

  return { entries, matchCount: matchLineNumbers.length, truncated };
}

/**
 * Search files for a regex pattern.
 *
 * Walks the file tree (skipping binary files and known directories),
 * searches each file line-by-line, and returns matches with optional context.
 */
export async function grep(options: GrepOptions): Promise<GrepResult> {
  const empty: GrepResult = { matches: [], matchCount: 0, truncated: false };

  if (!options.pattern) return empty;

  const searchPath = resolve(options.path ?? process.cwd());
  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES;
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const contextSize = options.context ?? 0;

  let regex: RegExp;
  try {
    regex = buildRegex(options.pattern, options);
  } catch {
    return empty;
  }

  // Check if the search path is a single file
  let isSingleFile = false;
  try {
    const pathStat = await stat(searchPath);
    isSingleFile = pathStat.isFile();
  } catch {
    return empty;
  }

  if (isSingleFile) {
    try {
      const file = Bun.file(searchPath);
      if (file.size > maxFileSize || file.size === 0) return empty;
      const content = await file.text();
      if (isBinaryContent(content)) return empty;
      const { entries, matchCount, truncated } = searchFileContent(
        content, regex, basename(searchPath), contextSize, maxMatches, 0,
      );
      return { matches: entries, matchCount, truncated };
    } catch {
      return empty;
    }
  }

  // Walk directory and search files
  const allMatches: GrepMatch[] = [];
  let totalMatchCount = 0;
  let truncated = false;

  for await (const relPath of walkFiles(searchPath, { glob: options.glob, maxFileSize })) {
    const absPath = resolve(searchPath, relPath);

    try {
      const content = await Bun.file(absPath).text();
      if (isBinaryContent(content)) continue;

      const result = searchFileContent(
        content, regex, relPath, contextSize, maxMatches, totalMatchCount,
      );

      if (result.matchCount > 0) {
        allMatches.push(...result.entries);
        totalMatchCount += result.matchCount;
      }

      if (result.truncated) {
        truncated = true;
        break;
      }
    } catch {
      continue;
    }
  }

  return { matches: allMatches, matchCount: totalMatchCount, truncated };
}
