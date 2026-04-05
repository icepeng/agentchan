import { appendFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "./util.js";

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
      "Append content to the end of a file. Creates the file (and parent directories) if it doesn't exist. Use this instead of write when adding content to an existing file.",
    parameters: AppendParams,
    label: "Append to file",

    async execute(
      _toolCallId: string,
      params: AppendInput,
    ): Promise<AgentToolResult<void>> {
      const filePath = resolve(workDir, params.file_path);
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, params.content, "utf-8");
      return textResult("Content appended successfully.");
    },
  };
}
