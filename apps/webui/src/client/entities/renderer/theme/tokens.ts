import type { RendererThemeTokens } from "../renderer.types.js";

export const TOKEN_TO_CSS: Record<keyof RendererThemeTokens, string> = {
  void: "--color-void",
  base: "--color-base",
  surface: "--color-surface",
  elevated: "--color-elevated",
  accent: "--color-accent",
  fg: "--color-fg",
  fg2: "--color-fg-2",
  fg3: "--color-fg-3",
  edge: "--color-edge",
};

export const TOKEN_KEYS = Object.keys(TOKEN_TO_CSS) as (keyof RendererThemeTokens)[];
