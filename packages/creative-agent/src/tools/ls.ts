import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { MAX_OUTPUT_BYTES } from "./util.js";

const MAX_ENTRIES = 500;

const LsParams = Type.Object({
  path: Type.Optional(
    Type.String({
      description:
        "Directory path to list (relative to project dir, default: project root)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of entries to return (default: 500)",
    }),
  ),
});

type LsInput = Static<typeof LsParams>;

export function createLsTool(cwd?: string): AgentTool<typeof LsParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "ls",
    description:
      "List directory contents. Returns sorted entries with a trailing '/' for directories.",
    parameters: LsParams,
    label: "List directory",

    async execute(
      _toolCallId: string,
      params: LsInput,
    ): Promise<AgentToolResult<void>> {
      const maxEntries = Math.min(params.limit ?? MAX_ENTRIES, MAX_ENTRIES);
      const dirPath = params.path ? resolve(workDir, params.path) : workDir;

      let dirents;
      try {
        dirents = await readdir(dirPath, { withFileTypes: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error reading directory: ${msg}`);
      }

      // Sort case-insensitive
      dirents.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      // Build output with dir suffix
      const outputLines: string[] = [];
      let totalBytes = 0;
      let truncated = false;

      for (const dirent of dirents) {
        if (outputLines.length >= maxEntries) {
          truncated = true;
          break;
        }

        const display = dirent.isDirectory() ? dirent.name + "/" : dirent.name;
        const lineBytes = Buffer.byteLength(display, "utf-8") + 1;
        if (totalBytes + lineBytes > MAX_OUTPUT_BYTES) {
          truncated = true;
          break;
        }
        totalBytes += lineBytes;
        outputLines.push(display);
      }

      if (outputLines.length === 0) {
        return textResult("(empty directory)");
      }

      if (truncated) {
        outputLines.push(
          `\n(Showing ${outputLines.length} of ${dirents.length} entries. Use a more specific path to see the rest.)`,
        );
      }

      return textResult(outputLines.join("\n"));
    },
  };
}
