import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult, truncateTail } from "./util.js";

const ScriptParams = Type.Object({
  file: Type.String({
    description:
      "Path to the .ts/.js/.mjs file to run, relative to the project directory.",
  }),
  args: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Arguments passed to the script as argv. Each element becomes one argv entry — no shell quoting needed.",
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
- args: array of strings passed as argv to the script — each element becomes one argv entry, with no shell quoting or escaping needed. The script reads them via process.argv (the first user-supplied arg is process.argv[2]).
- timeout: milliseconds before the script is killed (default: 120000).

The script runs with cwd set to the project root. Captured stdout and stderr are returned together; non-zero exit codes are surfaced. Output is truncated to roughly the last 50KB / 2000 lines.`;

/**
 * Run a TypeScript/JavaScript file using the bundled Bun runtime.
 *
 * In dev mode `process.execPath` is the user's `bun` binary; in a `bun --compile`
 * single executable it is the compiled exe itself, which when invoked with
 * `BUN_BE_BUN=1` exposes the full Bun CLI. Either way the same spawn command
 * works — no separate Bun installation is required for end users.
 */
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
      const scriptPath = resolve(workDir, file);

      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(
          [process.execPath, "run", scriptPath, ...args],
          {
            cwd: workDir,
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env, BUN_BE_BUN: "1" },
          },
        );
      } catch {
        return textResult("Error: Could not spawn script process.");
      }

      let timerId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          proc.kill();
          reject(new Error(`Script timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const resultPromise = (async () => {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout as ReadableStream).text(),
          new Response(proc.stderr as ReadableStream).text(),
          proc.exited,
        ]);

        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += (output ? "\n" : "") + `[stderr] ${stderr}`;
        if (exitCode !== 0) output += `\n[exit code: ${exitCode}]`;

        if (!output) return "(no output)";

        const { text } = truncateTail(output);
        return text;
      })();

      try {
        return textResult(await Promise.race([resultPromise, timeoutPromise]));
      } finally {
        clearTimeout(timerId!);
      }
    },
  };
}
