import type { AgentRunOpts, AgentRunResult, AgentRunner } from "./agent.ts";
import { AgentRateLimitError } from "./agent.ts";

const DEFAULT_STDERR_TAIL_LIMIT = 8_192;

export interface ClaudeRunnerDeps {
  model: string;
  stderrTailLimit?: number;
}

interface StreamEvent {
  type: "text";
  text: string;
}

function parseStreamLine(line: string): StreamEvent[] {
  if (!line.trim()) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return [];
  }
  const events: StreamEvent[] = [];
  const o = obj as Record<string, unknown>;
  if (o.type === "assistant") {
    const message = o.message as
      | { content?: Array<{ type: string; text?: string }> }
      | undefined;
    for (const block of message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        events.push({ type: "text", text: block.text });
      }
    }
  }
  return events;
}

function isRateLimitMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  );
}

// Strip API auth so spawned claude falls back to the Max subscription login
// instead of billing the API key.
function buildClaudeEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export function createClaudeRunner(deps: ClaudeRunnerDeps): AgentRunner {
  const env = buildClaudeEnv();
  const stderrTailLimit = deps.stderrTailLimit ?? DEFAULT_STDERR_TAIL_LIMIT;

  return {
    async run(opts: AgentRunOpts): Promise<AgentRunResult> {
      const proc = Bun.spawn(
        [
          "claude",
          "--print",
          "--verbose",
          "--output-format",
          "stream-json",
          "--dangerously-skip-permissions",
          "--model",
          deps.model,
          "-p",
          "-",
        ],
        {
          cwd: opts.cwd,
          env,
          stdin: new TextEncoder().encode(opts.promptText),
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      // Drain stderr in the background and keep only a tail. An undrained
      // pipe can fill the OS buffer and stall or crash the parent.
      let stderrTail = "";
      const stderrPromise = (async () => {
        const decoder = new TextDecoder();
        try {
          for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
            stderrTail += decoder.decode(chunk, { stream: true });
            if (stderrTail.length > stderrTailLimit) {
              stderrTail = stderrTail.slice(-stderrTailLimit);
            }
          }
        } catch {
          // Ignore — process tear-down may close the stream mid-read.
        }
      })();

      const onAbort = () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          // already dead
        }
      };
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }

      const decoder = new TextDecoder();
      let lineBuf = "";

      try {
        for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
          const str = decoder.decode(chunk, { stream: true });
          opts.onRaw(str);
          lineBuf += str;
          let nl: number;
          while ((nl = lineBuf.indexOf("\n")) >= 0) {
            const line = lineBuf.slice(0, nl);
            lineBuf = lineBuf.slice(nl + 1);
            for (const evt of parseStreamLine(line)) {
              if (evt.type === "text") opts.onText(evt.text);
            }
          }
        }
      } finally {
        opts.signal.removeEventListener("abort", onAbort);
      }

      await stderrPromise;
      const exitCode = await proc.exited;

      if (exitCode !== 0 && isRateLimitMessage(stderrTail)) {
        throw new AgentRateLimitError(stderrTail.trim().slice(-300));
      }

      return { exitCode, stderrTail };
    },
  };
}
