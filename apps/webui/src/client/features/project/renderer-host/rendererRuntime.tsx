import * as React from "react";
import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { jsxDEV } from "react/jsx-dev-runtime";
import type {
  RendererProps,
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";

export const FADE_DURATION_MS = 300;

export type RendererLayerId = 0 | 1;
export type RendererComponent = React.ComponentType<RendererProps>;

export interface RendererModule {
  default: RendererComponent;
  theme?: (snapshot: RendererSnapshot) => RendererTheme | null;
}

export interface RendererShellProps {
  Component: RendererComponent;
  actions: RendererProps["actions"];
  getSnapshot: () => RendererSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export function installRendererRuntime(): void {
  (globalThis as typeof globalThis & {
    __AGENTCHAN_RENDERER_V1__?: unknown;
  }).__AGENTCHAN_RENDERER_V1__ = {
    React,
    createRoot,
    useSyncExternalStore,
    Fragment,
    jsx,
    jsxs,
    jsxDEV,
  };
}

export function RendererShell({
  Component,
  actions,
  getSnapshot,
  subscribe,
}: RendererShellProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <Component snapshot={snapshot} actions={actions} />;
}

function isRendererComponent(value: unknown): value is RendererComponent {
  return typeof value === "function";
}

function isThemeFunction(
  value: unknown,
): value is (snapshot: RendererSnapshot) => RendererTheme | null {
  return value === undefined || typeof value === "function";
}

export function importRendererModule(js: string): Promise<RendererModule> {
  const blob = new Blob([js], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  return import(/* @vite-ignore */ url)
    .then((mod: { default?: unknown; theme?: unknown }) => {
      if (!isRendererComponent(mod.default)) {
        throw new Error(
          "Renderer default export must be a React component function.",
        );
      }
      if (!isThemeFunction(mod.theme)) {
        throw new Error("Renderer theme export must be a function when provided.");
      }
      return { default: mod.default, theme: mod.theme };
    })
    .finally(() => URL.revokeObjectURL(url));
}

export type { Root };
