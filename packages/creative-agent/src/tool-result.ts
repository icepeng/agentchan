import type { AgentToolResult } from "@mariozechner/pi-agent-core";

export function textResult(text: string): AgentToolResult<void> {
  return { content: [{ type: "text", text }], details: undefined };
}
