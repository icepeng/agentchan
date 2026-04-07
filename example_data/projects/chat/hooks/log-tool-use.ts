/**
 * PostToolUse hook: log every tool call to stderr.
 *
 * The simplest possible hook — read the JSON event from stdin, write a line
 * to stderr, exit 0. Stderr is logged but not surfaced to the model.
 */

const input = JSON.parse(await Bun.stdin.text()) as {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
};

const preview = JSON.stringify(input.tool_input ?? {}).slice(0, 120);
process.stderr.write(
  `[hook:${input.hook_event_name}] ${input.tool_name ?? "?"} ${preview}\n`,
);
