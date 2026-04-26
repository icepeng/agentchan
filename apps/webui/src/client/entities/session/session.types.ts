import type {
  ProjectSessionInfo,
  ProjectSessionState,
  SessionEntry,
} from "@agentchan/creative-agent";
import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@mariozechner/pi-ai";

export type {
  AssistantMessage,
  ImageContent,
  Message,
  ProjectSessionInfo,
  ProjectSessionState,
  SessionEntry,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  Usage,
  UserMessage,
};

export type ToolCallContent = ToolCall;
export type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;
export type MessageEntry = Extract<SessionEntry, { type: "message" }> & {
  message: Message;
};
export type CustomMessageEntry = Extract<SessionEntry, { type: "custom_message" }>;
