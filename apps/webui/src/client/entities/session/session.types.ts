import type { TokenUsage } from "@agentchan/creative-agent";
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
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  TokenUsage,
  UserMessage,
};

/** Backwards-compatible alias used by `MessageContent` / `ToolCallDisplay`. */
export type ToolCallContent = ToolCall;

/** Content union for assistant messages — text, thinking, or tool call. */
export type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;

/**
 * Persisted JSONL nodes carry pi-ai `Message` verbatim. The previous narrower
 * `ClientMessage` definition lost optional fields (timestamp, usage, api,
 * stopReason). Aliasing to pi `Message` keeps existing UI code working while
 * letting the renderer rebuild canonical pi messages from `state.messages`.
 */
export type ClientMessage = Message;

// --- Tree node ---

export interface TreeNode {
  id: string;
  parentId: string | null;
  message: ClientMessage;
  createdAt: number;
  activeChildId?: string;
  children?: string[];
  usage?: TokenUsage;
  meta?: "compact-summary" | (string & {});
}

// --- Session metadata ---

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  activeLeafId: string;
  provider: string;
  model: string;
  compactedFrom?: string;
  mode?: "creative" | "meta";
}
