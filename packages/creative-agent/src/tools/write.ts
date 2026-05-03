import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { resolveInProject } from "./_paths.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";

const WriteParams = Type.Object({
  file_path: Type.String({
    description: "Absolute or relative path to the file to write",
  }),
  content: Type.String({
    description: "The content to write to the file",
  }),
});

type WriteInput = Static<typeof WriteParams>;

export function createWriteTool(cwd?: string): AgentTool<typeof WriteParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "write",
    description:
      "Write content to a file. Creates parent directories if needed. Batch writes to different files.",
    parameters: WriteParams,
    label: "Write file",

    async execute(
      _toolCallId: string,
      params: WriteInput,
    ): Promise<AgentToolResult<void>> {
      const filePath = resolveInProject(workDir, params.file_path);
      return withFileMutationQueue(filePath, async () => {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, params.content, "utf-8");
        return textResult("File written successfully.");
      });
    },
  };
}
