import type {
  AgentchanSessionInfo,
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionInfoEntry,
  SessionMessageEntry,
  SessionMode,
} from "@agentchan/creative-agent";
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

export type {
  AgentchanSessionInfo,
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionInfoEntry,
  SessionMessageEntry,
  SessionMode,
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  UserMessage,
};

/** Backwards-compatible alias used by `MessageContent` / `ToolCallDisplay`. */
export type ToolCallContent = ToolCall;

/** Content union for assistant messages — text, thinking, or tool call. */
export type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;

/** Pi-ai `Message` alias kept so existing UI code stays terse. */
export type ClientMessage = Message;
