import type { TokenUsage } from "@agentchan/creative-agent";

export type { TokenUsage };

// --- pi-ai content block mirror types (rendering-only fields) ---

export interface TextContent { type: "text"; text: string }
export interface ThinkingContent { type: "thinking"; thinking: string }
export interface ToolCallContent { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
export interface ImageContent { type: "image"; data: string; mimeType: string }

export type AssistantContentBlock = TextContent | ToolCallContent | ThinkingContent;

// --- pi-ai message mirror types ---

export type ClientMessage =
  | { role: "user"; content: string | (TextContent | ImageContent)[]; timestamp: number }
  | { role: "assistant"; content: AssistantContentBlock[]; provider: string; model: string }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: (TextContent | ImageContent)[]; isError: boolean };

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

// --- Conversation metadata ---

export interface Conversation {
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

// --- Runtime-only: tool call in-progress view ---

export interface ToolCallState {
  id: string;
  name: string;
  inputJson: string;
  done: boolean;
  executing?: boolean;
  parallel?: boolean;
}
