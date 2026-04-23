// Single source of truth for renderer-facing types.
// Every project's tsconfig.json paths `@agentchan/types` maps here.
// Keep this file browser-safe (no runtime imports). LLM-authored `renderer/index.ts`
// consumes these via `import type { ... } from "@agentchan/types"`.
//
// Content below mirrors the agentchan host:
// - `AgentState` is the UI subset of pi `agent.state`
// - Message types mirror `@mariozechner/pi-ai`
// - `ProjectFile` mirrors `@agentchan/creative-agent` workspace types

// ============================================================================
// Primitive content blocks (pi-ai mirror)
// ============================================================================

export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

// ============================================================================
// Messages (pi-ai mirror)
// ============================================================================

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  responseId?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

// ============================================================================
// Agent state (UI subset of pi `agent.state`)
// ============================================================================

/**
 * Renderer-visible agent state. Wire format: `pendingToolCalls` is a plain
 * array (not Set) so it can be JSON-serialized over SSE.
 */
export interface AgentState {
  messages: AgentMessage[];
  streamingMessage?: AssistantMessage;
  pendingToolCalls: string[];
  isStreaming: boolean;
  errorMessage?: string;
}

// ============================================================================
// Project files (creative-agent workspace mirror)
// ============================================================================

export interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

export interface DataFile {
  type: "data";
  path: string;
  content: string;
  data: unknown;
  format: "yaml" | "json";
  modifiedAt: number;
}

export interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

export type ProjectFile = TextFile | DataFile | BinaryFile;

// ============================================================================
// Project theme (setTheme action payload)
// ============================================================================

export type ThemeToken =
  | "void"
  | "base"
  | "surface"
  | "elevated"
  | "accent"
  | "fg"
  | "fg2"
  | "fg3"
  | "edge";

export interface ProjectTheme {
  base: Partial<Record<ThemeToken, string>>;
  dark?: Partial<Record<ThemeToken, string>>;
  prefersScheme?: "light" | "dark";
}
