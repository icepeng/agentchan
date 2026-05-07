import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { CompactionSummaryMessage } from "@agentchan/creative-agent/src/session/messages.js";

export type {
  AgentMessage,
  AssistantMessage,
  CompactionSummaryMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
};

export type AssistantContentBlock = AssistantMessage["content"][number];
