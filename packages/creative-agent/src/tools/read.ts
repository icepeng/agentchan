import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult, MAX_LINES, MAX_OUTPUT_BYTES } from "./util.js";

const ReadParams = Type.Object({
  file_path: Type.String({
    description: "Absolute or relative path to the file to read",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "Line number to start reading from (1-based, default: 1)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of lines to read (default: 2000)",
    }),
  ),
});

type ReadInput = Static<typeof ReadParams>;

export function createReadTool(cwd?: string): AgentTool<typeof ReadParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "read",
    description:
      `Read a file's contents with line numbers. Output is truncated to ${MAX_LINES} lines or ${MAX_OUTPUT_BYTES / 1024}KB. Use offset/limit for large files.`,
    parameters: ReadParams,
    label: "Read file",

    async execute(
      _toolCallId: string,
      params: ReadInput,
    ): Promise<AgentToolResult<void>> {
      const filePath = resolve(workDir, params.file_path);
      const offset = (params.offset ?? 1) - 1;
      const limit = Math.min(params.limit ?? MAX_LINES, MAX_LINES);

      const content = await readFile(filePath, "utf-8");
      const allLines = content.split("\n");
      const totalLines = allLines.length;

      const sliced = allLines.slice(offset, offset + limit);
      const startLineNum = offset + 1;

      // Format with line numbers
      const numbered: string[] = [];
      let totalBytes = 0;
      let byteTruncated = false;

      for (let i = 0; i < sliced.length; i++) {
        const lineNum = startLineNum + i;
        const formatted = `${String(lineNum).padStart(6, " ")}\t${sliced[i]}`;
        const lineBytes = Buffer.byteLength(formatted, "utf-8") + 1;

        if (totalBytes + lineBytes > MAX_OUTPUT_BYTES) {
          byteTruncated = true;
          break;
        }
        totalBytes += lineBytes;
        numbered.push(formatted);
      }

      // Build result with continuation hint
      const shownLines = numbered.length;
      const endLineNum = startLineNum + shownLines - 1;
      let result = numbered.join("\n");

      const hasMore = endLineNum < totalLines;
      if (byteTruncated || hasMore) {
        const nextOffset = endLineNum + 1;
        result += `\n\n[Showing lines ${startLineNum}-${endLineNum} of ${totalLines}. Use offset=${nextOffset} to continue.]`;
      }

      return textResult(result);
    },
  };
}
