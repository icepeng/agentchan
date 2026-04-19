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
        "Arguments passed to the script as the first parameter. Each element becomes one entry — no shell quoting needed.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in milliseconds (default: 120000)" }),
  ),
});

type ScriptInput = Static<typeof ScriptParams>;

const DESCRIPTION = `Run a TypeScript or JavaScript file from the project directory.

The script must \`export default function (args, ctx)\` (sync or async). It receives:
- \`args\` — the args[] passed to this tool, as a readonly string[]
- \`ctx\` — {
    project: { readFile, writeFile, exists, listDir, stat(path) → {mtime,size}|null },
    sqlite: { open(relPath) → handle },
    yaml: { parse, stringify },
    random: { int(minIncl, maxExcl) },
    util: { parseArgs(config) }
  }
- \`ctx.util.parseArgs\` mirrors \`node:util.parseArgs\` — pass {args, options, strict, allowPositionals} as usual.
- \`ctx.sqlite.open(path)\` returns { exec(sql), all(sql, params?), run(sql, params?), batch(fn), close() }. batch runs fn() inside a single transaction — only exec/all/run on the same handle are allowed inside, throwing rolls back.

The function's return value becomes the tool's output: \`string\` is passed through, \`object\` is JSON.stringify'd, \`undefined\` yields "(no output)". Throw an Error to fail; the message is surfaced to the caller. Output is truncated to roughly the last 50KB / 2000 lines.

The script runs inside a QuickJS WASM sandbox: \`fs\`, \`process\`, \`Bun\`, \`fetch\`, \`require\`, \`import\` of host modules, \`setInterval\`, and real timers are not available — use the \`ctx\` capabilities instead. \`setTimeout(cb, ms)\` is polyfilled as a microtask (\`ms\` is ignored). Memory is capped at 64 MB and the run is aborted after the tool's \`timeout\`.`;

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
