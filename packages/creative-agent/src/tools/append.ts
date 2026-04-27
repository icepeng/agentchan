import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { resolveInProject } from "./_paths.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";

const AppendParams = Type.Object({
  file_path: Type.String({
    description: "Absolute or relative path to the file",
  }),
  content: Type.String({
    description:
      "The content to append. Content is appended as-is; include a leading newline if needed.",
  }),
});

type AppendInput = Static<typeof AppendParams>;

export function createAppendTool(cwd?: string): AgentTool<typeof AppendParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "append",
    description:
      `Append content to the end of a file. Creates parent directories if needed. Use this instead of write when adding to an existing file. Batch appends to different files.`,
    parameters: AppendParams,
    label: "Append to file",

    async execute(
      _toolCallId: string,
      params: AppendInput,
    ): Promise<AgentToolResult<void>> {
      const filePath = resolveInProject(workDir, params.file_path);
      return withFileMutationQueue(filePath, async () => {
        await mkdir(dirname(filePath), { recursive: true });
        await appendFile(filePath, params.content, "utf-8");
        return textResult("Content appended successfully.");
      });
    },
  };
}
