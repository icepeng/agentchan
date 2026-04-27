import {
  validateTheme,
  type RendererSnapshot,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import type { RendererModule } from "@/client/entities/renderer/bundle/index.js";

export function evaluateTheme(
  mod: RendererModule,
  snapshot: RendererSnapshot,
): RendererTheme | null {
  try {
    return validateTheme(mod.renderer.theme?.(snapshot) ?? null);
  } catch (error) {
    console.warn("[renderer.theme] theme function threw", error);
    return null;
  }
}

export function themeIdentity(theme: RendererTheme | null): string {
  if (theme === null) return "null";
  return JSON.stringify({
    base: sortedTokens(theme.base),
    dark: sortedTokens(theme.dark ?? {}),
    prefersScheme: theme.prefersScheme ?? null,
  });
}

function sortedTokens(tokens: Partial<RendererTheme["base"]>): [string, string][] {
  return Object.entries(tokens)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));
}
