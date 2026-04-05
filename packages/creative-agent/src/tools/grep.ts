import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { grep } from "@agentchan/grep";
import { textResult } from "./util.js";

const GrepParams = Type.Object({
  pattern: Type.String({
    description: "Regex pattern to search for in file contents",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "File or directory to search in (relative to project dir, default: project root)",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description:
        'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")',
    }),
  ),
  ignoreCase: Type.Optional(
    Type.Boolean({ description: "Case-insensitive search (default: false)" }),
  ),
  literal: Type.Optional(
    Type.Boolean({
      description: "Treat pattern as literal string, not regex (default: false)",
    }),
  ),
  context: Type.Optional(
    Type.Number({
      description: "Number of context lines before and after each match",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of matches to return (default: 100)",
    }),
  ),
});

type GrepInput = Static<typeof GrepParams>;

export function createGrepTool(
  projectDir: string,
): AgentTool<typeof GrepParams, void> {
  return {
    name: "grep",
    description:
      "Search file contents for a regex pattern. Skips binary files. Returns matching lines with file paths and line numbers.",
    parameters: GrepParams,
    label: "Search file contents",

    async execute(
      _toolCallId: string,
      params: GrepInput,
    ): Promise<AgentToolResult<void>> {
      const searchPath = params.path
        ? resolve(projectDir, params.path)
        : projectDir;

      const result = await grep({
        pattern: params.pattern,
        path: searchPath,
        glob: params.glob,
        ignoreCase: params.ignoreCase,
        literal: params.literal,
        context: params.context,
        maxMatches: params.limit,
      });

      if (result.matchCount === 0) {
        return textResult("No matches found.");
      }

      // Format output similar to ripgrep: filepath:linenum: text
      const lines: string[] = [];
      let lastPath = "";

      for (const match of result.matches) {
        if (match.path !== lastPath) {
          if (lastPath !== "") lines.push("");
          lastPath = match.path;
        }
        const prefix = match.isContext ? "-" : ":";
        lines.push(`${match.path}:${match.lineNumber}${prefix}${match.text}`);
      }

      if (result.truncated) {
        lines.push(
          `\n[Truncated: showing ${result.matchCount} matches. Use limit parameter or narrow your search.]`,
        );
      }

      return textResult(lines.join("\n"));
    },
  };
}
