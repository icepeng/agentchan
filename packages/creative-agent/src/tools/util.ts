import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";

export const MAX_LINES = 2000;
export const MAX_OUTPUT_BYTES = 50 * 1024;

export function textResult(text: string): AgentToolResult<void> {
  return { content: [{ type: "text", text } as TextContent], details: undefined as void };
}
