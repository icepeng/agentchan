import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import {
  fileUrl,
  type AgentState,
  type DataFile,
  type BinaryFile,
  type FileUrlOptions,
  type ProjectFile,
  type RendererActions,
  type RendererOptions,
  type RendererRuntime,
  type RendererSnapshot,
  type RendererTheme,
  type RendererThemeTokens,
  type TextFile,
  type AgentMessage,
  type AssistantContentBlock,
  type AssistantMessage,
  type CompactionSummaryMessage,
  type ImageContent,
  type Message,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
  type ToolResultMessage,
  type UserMessage,
} from "./internal.ts";

export {
  fileUrl,
  type AgentState,
  type BinaryFile,
  type DataFile,
  type FileUrlOptions,
  type ProjectFile,
  type RendererActions,
  type RendererSnapshot,
  type RendererTheme,
  type RendererThemeTokens,
  type TextFile,
  type AgentMessage,
  type AssistantContentBlock,
  type AssistantMessage,
  type CompactionSummaryMessage,
  type ImageContent,
  type Message,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
  type ToolResultMessage,
  type UserMessage,
};

export {
  useAutoScroll,
  type UseAutoScrollOptions,
  type UseAutoScrollResult,
} from "./use-auto-scroll.ts";

export interface RendererProps {
  snapshot: RendererSnapshot;
  actions: RendererActions;
}

export function createRenderer(
  Component: ComponentType<RendererProps>,
  options: RendererOptions = {},
): RendererRuntime {
  return {
    mount(container, bridge) {
      let currentSnapshot = bridge.snapshot;
      const root = createRoot(container);

      function render() {
        root.render(createElement(Component, {
          snapshot: currentSnapshot,
          actions: bridge.actions,
        }));
      }

      render();

      return {
        update(snapshot) {
          currentSnapshot = snapshot;
          render();
        },
        unmount() {
          root.unmount();
        },
      };
    },
    theme: options.theme,
  };
}
