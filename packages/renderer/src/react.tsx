import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  defineRenderer,
  fileUrl,
  isRendererRuntime,
  type DataFile,
  type BinaryFile,
  type DefineRendererContext,
  type FileUrlOptions,
  type ProjectFile,
  type RendererActions,
  type RendererAgentState,
  type RendererBridge,
  type RendererInstance,
  type RendererOptions,
  type RendererRuntime,
  type RendererSnapshot,
  type RendererTheme,
  type RendererThemeTokens,
  type TextFile,
} from "./core.ts";

export {
  defineRenderer,
  fileUrl,
  isRendererRuntime,
  type BinaryFile,
  type DataFile,
  type DefineRendererContext,
  type FileUrlOptions,
  type ProjectFile,
  type RendererActions,
  type RendererAgentState,
  type RendererBridge,
  type RendererInstance,
  type RendererOptions,
  type RendererRuntime,
  type RendererSnapshot,
  type RendererTheme,
  type RendererThemeTokens,
  type TextFile,
};

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
