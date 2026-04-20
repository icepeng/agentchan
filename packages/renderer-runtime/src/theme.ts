import type { RendererTheme, RendererThemeTokens } from "./types.js";

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

export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickTokens(src: Record<string, unknown>): RendererThemeTokens {
  const out: RendererThemeTokens = {};
  for (const key of TOKEN_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

export function validateTheme(raw: unknown): RendererTheme | null {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) {
    console.warn("[renderer.theme] expected an object, got", typeof raw);
    return null;
  }
  if (!isPlainObject(raw.base)) {
    console.warn("[renderer.theme] missing or invalid `base` tokens");
    return null;
  }
  const base = pickTokens(raw.base);
  if (Object.keys(base).length === 0) {
    console.warn("[renderer.theme] `base` contains no recognized tokens");
    return null;
  }
  const theme: RendererTheme = { base };

  if (raw.dark !== undefined) {
    if (isPlainObject(raw.dark)) {
      const dark = pickTokens(raw.dark);
      if (Object.keys(dark).length > 0) {
        theme.dark = dark;
      }
    } else {
      console.warn("[renderer.theme] `dark` must be an object; ignored");
    }
  }

  if (raw.prefersScheme === "light" || raw.prefersScheme === "dark") {
    theme.prefersScheme = raw.prefersScheme;
  } else if (raw.prefersScheme !== undefined) {
    console.warn(
      '[renderer.theme] `prefersScheme` must be "light" or "dark"; ignored',
    );
  }

  return theme;
}

// Single-mode (no `dark`) defaults to "light" so user toggle stays in effect
// when prefersScheme isn't set. Host and iframe must share this rule —
// divergent defaults caused token mismatch between Sidebar and renderer body.
export function resolveThemeVars(
  theme: RendererTheme,
  userScheme: "light" | "dark",
): ResolvedThemeVars {
  const hasDark = theme.dark && Object.keys(theme.dark).length > 0;
  const effectiveScheme: "light" | "dark" =
    theme.prefersScheme ?? (hasDark ? userScheme : "light");

  const merged: RendererThemeTokens =
    effectiveScheme === "dark" && theme.dark
      ? { ...theme.base, ...theme.dark }
      : theme.base;

  const vars: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    const value = merged[key];
    if (typeof value === "string" && value.length > 0) {
      vars[TOKEN_TO_CSS[key]] = value;
    }
  }

  return {
    vars,
    effectiveScheme,
    forceScheme: theme.prefersScheme !== undefined,
  };
}
