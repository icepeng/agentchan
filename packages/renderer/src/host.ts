/// <reference lib="dom" />

/**
 * Host orchestrator surface. Consumed by webui's renderer-host (iframe
 * element management, Comlink wrap, presentation state). Re-exports the
 * cross-cutting renderer types the host inspects plus host-only helpers.
 */

export {
  attachRpc,
  isRendererRuntime,
  RENDERER_INIT_MESSAGE_TYPE,
} from "./internal.ts";
export type {
  AgentEvent,
  AgentMessage,
  AgentState,
  AssistantContentBlock,
  AssistantMessage,
  BinaryFile,
  CompactionSummaryMessage,
  DataFile,
  HydratePayload,
  ImageContent,
  Message,
  ProjectFile,
  RendererActions,
  RendererBridge,
  RendererBundle,
  RendererHostApi,
  RendererInitMessage,
  RendererInstance,
  RendererRuntime,
  RendererShellApi,
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
