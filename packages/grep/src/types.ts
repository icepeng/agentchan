/** Skip files larger than this (1MB) */
export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

export interface GrepOptions {
  pattern: string;
  /** Directory or file to search (default: cwd) */
  path?: string;
  /** File filter glob (e.g. "*.ts") */
  glob?: string;
  ignoreCase?: boolean;
  /** Treat pattern as literal string (escape regex special chars) */
  literal?: boolean;
  /** Number of context lines before and after each match */
  context?: number;
  /** Maximum number of matches to return (default: 100) */
  maxMatches?: number;
  /** Skip files larger than this in bytes (default: 1MB) */
  maxFileSize?: number;
}

export interface GrepMatch {
  /** Relative path from search root */
  path: string;
  lineNumber: number;
  text: string;
  /** true for context lines, false for actual matches */
  isContext: boolean;
}

export interface GrepResult {
  matches: GrepMatch[];
  /** Count of actual matches only (not context lines) */
  matchCount: number;
  /** true if maxMatches was reached before all files were searched */
  truncated: boolean;
}

export interface WalkOptions {
  /** File filter glob (e.g. "*.ts") */
  glob?: string;
  /** Skip files larger than this in bytes (default: 1MB) */
  maxFileSize?: number;
}
