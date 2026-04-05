import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult, MAX_LINES, MAX_OUTPUT_BYTES } from "./util.js";

const isWindows = process.platform === "win32";

const BashParams = Type.Object({
  command: Type.String({
    description: isWindows
      ? "The PowerShell command to execute"
      : "The shell command to execute",
  }),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in milliseconds (default: 120000)" }),
  ),
});

type BashInput = Static<typeof BashParams>;

/** Keep the last N lines / max bytes of output (tail truncation). */
function truncateTail(text: string): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= MAX_LINES) {
    if (Buffer.byteLength(text, "utf-8") <= MAX_OUTPUT_BYTES) {
      return { text, truncated: false };
    }
  }

  // Take last MAX_LINES lines, then trim to MAX_OUTPUT_BYTES
  const tail = lines.slice(-MAX_LINES);
  let result = tail.join("\n");
  const bytes = Buffer.byteLength(result, "utf-8");
  if (bytes > MAX_OUTPUT_BYTES) {
    // Binary search is overkill — just slice from the end
    const buf = Buffer.from(result, "utf-8");
    result = buf.subarray(buf.length - MAX_OUTPUT_BYTES).toString("utf-8");
    // Drop the first (likely partial) line
    const newlineIdx = result.indexOf("\n");
    if (newlineIdx !== -1) result = result.slice(newlineIdx + 1);
  }

  const shownLines = result.split("\n").length;
  const header = `(output truncated — showing last ${shownLines} of ${lines.length} lines)\n`;
  return { text: header + result, truncated: true };
}

export function createBashTool(cwd?: string): AgentTool<typeof BashParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "bash",
    description: isWindows
      ? "Execute a PowerShell command and return its output (stdout + stderr). Commands run via powershell -NoProfile -Command."
      : "Execute a shell command and return its output (stdout + stderr).",
    parameters: BashParams,
    label: "Execute shell command",

    async execute(
      _toolCallId: string,
      params: BashInput,
    ): Promise<AgentToolResult<void>> {
      const { command, timeout: timeoutMs = 120_000 } = params;

      const shellArgs = isWindows
        ? ["powershell", "-NoProfile", "-NonInteractive", "-Command", command]
        : ["bash", "-c", command];

      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(shellArgs, {
          cwd: workDir,
          stdout: "pipe",
          stderr: "pipe",
          env: process.env,
        });
      } catch {
        return textResult("Error: Could not spawn shell process.");
      }

      let timerId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
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
