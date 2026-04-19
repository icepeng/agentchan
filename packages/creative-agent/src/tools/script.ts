import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { runScriptInQuickJS } from "../runtime/quickjs-runner.js";
import { resolveInProject } from "./_paths.js";
import { truncateTail } from "./util.js";

const ScriptParams = Type.Object({
  file: Type.String({
    description:
      "Path to the .ts/.js/.mjs file to run, relative to the project directory.",
  }),
  args: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Arguments passed to the script. Each element becomes one entry — no shell quoting needed.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in milliseconds (default: 120000)" }),
  ),
});

type ScriptInput = Static<typeof ScriptParams>;

const DESCRIPTION = `Run a TypeScript or JavaScript file from the project directory.

Usage:
- file: path relative to the project root (e.g. "scripts/word-count.ts"). Must be a .ts, .js, or .mjs file that exists in the project.
- args: array of strings passed to the script. Each element becomes one argument, with no shell quoting or escaping needed.
- timeout: milliseconds before the script is killed (default: 120000).

The script runs with cwd set to the project root. Captured stdout and stderr are returned together; non-zero exit codes are surfaced. Output is truncated to roughly the last 50KB / 2000 lines.`;

export function createScriptTool(cwd?: string): AgentTool<typeof ScriptParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "script",
    description: DESCRIPTION,
    parameters: ScriptParams,
    label: "Run script",

    async execute(
      _toolCallId: string,
      params: ScriptInput,
    ): Promise<AgentToolResult<void>> {
      const { file, args = [], timeout: timeoutMs = 120_000 } = params;
      const scriptPath = resolveInProject(workDir, file);

      const { output, error } = await runScriptInQuickJS(workDir, scriptPath, args, {
        timeoutMs,
      });

      let text: string;
      if (error) {
        text = output && output !== "(no output)" ? `${output}\nError: ${error}` : `Error: ${error}`;
      } else {
        text = output;
      }

      return textResult(truncateTail(text).text);
    },
  };
}
