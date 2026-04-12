import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";

export function textResult(text: string): AgentToolResult<void> {
  return { content: [{ type: "text", text } as TextContent], details: undefined as void };
}
