/// <reference lib="dom" />

/**
 * Host orchestrator surface. Consumed by webui's renderer-host (iframe
 * element management, Comlink wrap, presentation state). Re-exports the
 * cross-cutting renderer types the host inspects plus host-only helpers.
 */

export { isRendererRuntime } from "./internal.ts";
export type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  BinaryFile,
  CompactionSummaryMessage,
  DataFile,
  ImageContent,
  Message,
  ProjectFile,
  RendererActions,
  RendererAgentState,
  RendererBridge,
  RendererBundle,
  RendererInstance,
  RendererRuntime,
  RendererSnapshot,
  RendererTheme,
  RendererThemeTokens,
  TextContent,
  TextFile,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "./internal.ts";
