// --- Re-export pi-ai/pi-agent-core message types as canonical persistence types ---

import type { AgentMessage } from "@mariozechner/pi-agent-core";
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
import type {
  CompactionEntry,
  SessionEntryBase,
  SessionEntry,
  SessionHeader as PiSessionHeader,
  SessionInfoEntry,
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import type { SessionMode } from "./session/format.js";

export type { AgentMessage };
export type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
};
export type {
  CompactionEntry,
  SessionEntry,
  SessionEntryBase,
  SessionInfoEntry,
  SessionMessageEntry,
};

export type AgentchanSessionHeader = PiSessionHeader & {
  /** Agentchan runtime mode. Omitted means creative. */
  mode?: SessionMode;
};
