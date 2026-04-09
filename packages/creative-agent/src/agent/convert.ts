/**
 * Conversion between agentchan's persistence format (StoredMessage/ContentBlock)
 * and pi-ai's runtime format (Message).
 *
 * pi-ai only uses role + content from history messages, so we cast minimal
 * objects as Message rather than constructing full AssistantMessage with dummy fields.
 */

import type {
  Message,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
} from "@mariozechner/pi-ai";
import type { StoredMessage, ContentBlock, TokenUsage } from "../types.js";

// --- StoredMessage[] → pi-ai Message[] ---

export function storedToPiMessages(history: StoredMessage[]): Message[] {
  const result: Message[] = [];

  // Build tool_use_id → tool name map for ToolResultMessage conversion
  const toolNameMap = new Map<string, string>();
  for (const msg of history) {
    if (msg.role === "assistant") {
      for (const block of msg.content) {
        if (block.type === "tool_use") toolNameMap.set(block.id, block.name);
      }
    }
  }

  for (const msg of history) {
    if (msg.role === "user") {
      const textBlocks = msg.content.filter((b) => b.type === "text");
      const toolResultBlocks = msg.content.filter((b) => b.type === "tool_result");

      if (textBlocks.length > 0 && toolResultBlocks.length === 0) {
        const text = textBlocks.map((b) => (b as { type: "text"; text: string }).text).join("\n");
        // Merge with previous user message if applicable. Providers like OpenAI
        // reject two consecutive user messages, and the always-active seed +
        // real user node pattern relies on this concatenation.
        const last = result[result.length - 1];
        if (last && last.role === "user" && typeof last.content === "string") {
          last.content = last.content + "\n" + text;
        } else {
          result.push({ role: "user", content: text } as Message);
        }
      }

      for (const block of toolResultBlocks) {
        if (block.type !== "tool_result") continue;
        result.push({
          role: "toolResult",
          toolCallId: block.tool_use_id,
          toolName: toolNameMap.get(block.tool_use_id) ?? "unknown",
          content: [{ type: "text", text: block.content }],
          isError: block.is_error ?? false,
        } as Message);
      }
    } else if (msg.role === "assistant") {
      const piContent: any[] = [];
      for (const block of msg.content) {
        switch (block.type) {
          case "text":
            piContent.push({ type: "text", text: block.text });
            break;
          case "thinking":
            piContent.push({ type: "thinking", thinking: block.text });
            break;
          case "tool_use":
            piContent.push({ type: "toolCall", id: block.id, name: block.name, arguments: block.input });
            break;
        }
      }
      if (piContent.length > 0) {
        result.push({ role: "assistant", content: piContent } as Message);
      }
    }
  }

  return result;
}

// --- pi-ai Message[] → StoredMessage[] ---

export function piToStoredMessages(messages: Message[]): StoredMessage[] {
  const result: StoredMessage[] = [];
  let pendingToolResults: ContentBlock[] = [];

  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      result.push({ role: "user", content: [...pendingToolResults] });
      pendingToolResults = [];
    }
  }

  for (const msg of messages) {
    switch (msg.role) {
      case "user": {
        flushToolResults();
        const userMsg = msg;
        const text =
          typeof userMsg.content === "string"
            ? userMsg.content
            : userMsg.content
                .filter((c): c is TextContent => c.type === "text")
                .map((c) => c.text)
                .join("\n");
        result.push({ role: "user", content: [{ type: "text", text }] });
        break;
      }
      case "assistant": {
        flushToolResults();
        const assistantMsg = msg;
        const content: ContentBlock[] = [];

        for (const block of assistantMsg.content) {
          switch (block.type) {
            case "text":
              content.push({ type: "text", text: block.text });
              break;
            case "thinking":
              content.push({ type: "thinking", text: block.thinking });
              break;
            case "toolCall":
              content.push({ type: "tool_use", id: block.id, name: block.name, input: block.arguments });
              break;
          }
        }

        if (content.length > 0) result.push({ role: "assistant", content });
        break;
      }
      case "toolResult": {
        const toolResult = msg as ToolResultMessage;
        const text = toolResult.content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        pendingToolResults.push({
          type: "tool_result",
          tool_use_id: toolResult.toolCallId,
          content: text,
          ...(toolResult.isError ? { is_error: true } : {}),
        });
        break;
      }
    }
  }

  flushToolResults();
  return result;
}

/** Extract usage stats from a completed AssistantMessage. */
export function extractUsage(msg: AssistantMessage): TokenUsage {
  const usage = msg.usage;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    ...(usage.cacheRead ? { cachedInputTokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite ? { cacheCreationTokens: usage.cacheWrite } : {}),
    ...(usage.cost?.total ? { cost: usage.cost.total } : {}),
  };
}
