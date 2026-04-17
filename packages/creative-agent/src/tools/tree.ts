import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { MAX_OUTPUT_BYTES } from "./util.js";

const MAX_ENTRIES = 1000;
const DEFAULT_DEPTH = 3;
const MAX_DEPTH = 10;

const TreeParams = Type.Object({
  path: Type.Optional(
    Type.String({
      description:
        "Directory path to list (relative to project dir, default: project root)",
    }),
  ),
  depth: Type.Optional(
    Type.Number({
      description: `Maximum directory depth to traverse (default: ${DEFAULT_DEPTH}, max: ${MAX_DEPTH})`,
    }),
  ),
});

type TreeInput = Static<typeof TreeParams>;

export function createTreeTool(
  cwd?: string,
): AgentTool<typeof TreeParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "tree",
    description:
      "Show directory tree structure. Recursively lists files and directories with visual indentation. Directories have a trailing '/'.",
    parameters: TreeParams,
    label: "Directory tree",

    async execute(
      _toolCallId: string,
      params: TreeInput,
    ): Promise<AgentToolResult<void>> {
      const maxDepth = Math.min(
        Math.max(params.depth ?? DEFAULT_DEPTH, 1),
        MAX_DEPTH,
      );
      const dirPath = params.path ? resolve(workDir, params.path) : workDir;

      // Verify root directory is readable before walking
      let rootDirents;
      try {
        rootDirents = await readdir(dirPath, { withFileTypes: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error reading directory: ${msg}`);
      }

      const outputLines: string[] = [];
      let totalBytes = 0;
      let totalEntries = 0;
      let truncated = false;

      // Root line — strip trailing slashes to avoid "sub//"
      const rootDisplay = params.path
        ? params.path.replace(/\\/g, "/").replace(/\/+$/, "") + "/"
        : "./";
      outputLines.push(rootDisplay);
      totalBytes += Buffer.byteLength(rootDisplay, "utf-8") + 1;

      async function walk(
        dir: string,
        dirents: import("node:fs").Dirent[],
        prefix: string,
        currentDepth: number,
      ): Promise<void> {
        if (truncated || currentDepth > maxDepth) return;

        // Sort: directories first, then case-insensitive alphabetical
        dirents.sort((a, b) => {
          const aIsDir = a.isDirectory() ? 0 : 1;
          const bIsDir = b.isDirectory() ? 0 : 1;
          if (aIsDir !== bIsDir) return aIsDir - bIsDir;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        for (let i = 0; i < dirents.length; i++) {
          if (truncated) return;

          const dirent = dirents[i];
          if (!dirent) continue;
          const isLast = i === dirents.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const display = dirent.isDirectory()
            ? dirent.name + "/"
            : dirent.name;
          const line = prefix + connector + display;

          const lineBytes = Buffer.byteLength(line, "utf-8") + 1;
          if (
            totalBytes + lineBytes > MAX_OUTPUT_BYTES ||
            totalEntries >= MAX_ENTRIES
          ) {
            truncated = true;
            return;
          }

          outputLines.push(line);
          totalBytes += lineBytes;
          totalEntries++;

          if (dirent.isDirectory() && currentDepth < maxDepth) {
            let childDirents;
            try {
              childDirents = await readdir(resolve(dir, dirent.name), {
                withFileTypes: true,
              });
            } catch {
              continue; // skip unreadable subdirectories
            }
            const childPrefix = prefix + (isLast ? "    " : "│   ");
            await walk(
              resolve(dir, dirent.name),
              childDirents,
              childPrefix,
              currentDepth + 1,
            );
          }
        }
      }

      await walk(dirPath, rootDirents, "", 1);

      if (outputLines.length <= 1 && !truncated) {
        return textResult("(empty directory)");
      }

      if (truncated) {
        outputLines.push(
          `\n(Showing ${totalEntries} entries, truncated. Use a more specific path or lower depth to see details.)`,
        );
      }

      return textResult(outputLines.join("\n"));
    },
  };
}
