import type {
  RendererTheme,
  RendererThemeTokens,
} from "@agentchan/renderer/host";
import type { ResolvedThemeVars } from "./renderer.types.js";

/**
 * Renderer-owned Project theme: Renderer가 Project chat surface 한정으로 Host가
 * 이해하는 complete color token set을 제공하는 계약.
 *
 * - 색상 전용. Renderer iframe 안에서는 Host fallback font token을 읽을 수 있지만,
 *   Project theme callback으로 Host font를 바꾸지는 않는다.
 * - `light`와 `dark` 중 최소 하나가 필요하다. 둘 다 있으면 user Appearance 토글이
 *   살아 있고, 하나만 있으면 chat scope에서 그 scheme으로 잠긴다.
 * - `theme(snapshot)` 함수는 현재 files를 보고 팔레트를 다르게 반환할 수 있다.
 */

const TOKEN_TO_CSS: Record<keyof RendererThemeTokens, string> = {
  void: "--color-void",
  base: "--color-base",
  surface: "--color-surface",
  elevated: "--color-elevated",
  accent: "--color-accent",
  fg: "--color-fg",
  fg2: "--color-fg-2",
  fg3: "--color-fg-3",
  fg4: "--color-fg-4",
  edge: "--color-edge",
};

const TOKEN_KEYS = Object.keys(TOKEN_TO_CSS) as (keyof RendererThemeTokens)[];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickTokens(src: Record<string, unknown>): Partial<RendererThemeTokens> {
  const out: Partial<RendererThemeTokens> = {};
  for (const key of TOKEN_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

function hasCompletePalette(
  tokens: Partial<RendererThemeTokens>,
): tokens is RendererThemeTokens {
  return TOKEN_KEYS.every((key) => typeof tokens[key] === "string");
}

function validatePalette(
  raw: unknown,
  label: "light" | "dark",
): RendererThemeTokens | null | "missing" {
  if (raw === undefined) return "missing";
  if (!isPlainObject(raw)) {
    console.warn(`[renderer.theme] \`${label}\` must be an object`);
    return null;
  }
  const tokens = pickTokens(raw);
  if (!hasCompletePalette(tokens)) {
    console.warn(
      `[renderer.theme] \`${label}\` must contain a complete color token set`,
    );
    return null;
  }
  return tokens;
}

/**
 * 렌더러 모듈의 `theme` export를 런타임 검증한다.
 * 잘못된 shape이면 null 반환 (console.warn 남김).
 */
export function validateTheme(raw: unknown): RendererTheme | null {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) {
    console.warn("[renderer.theme] expected an object, got", typeof raw);
    return null;
  }

  const light = validatePalette(raw.light, "light");
  if (light === null) return null;
  const dark = validatePalette(raw.dark, "dark");
  if (dark === null) return null;

  if (light === "missing" && dark === "missing") {
    console.warn("[renderer.theme] must declare `light`, `dark`, or both");
    return null;
  }

  const theme: RendererTheme = {};
  if (light !== "missing") theme.light = light;
  if (dark !== "missing") theme.dark = dark;
  return theme;
}

/**
 * 사용자의 현재 scheme과 theme 선언을 합쳐 실제 주입할 CSS 변수와 실효 scheme을 계산한다.
 *
 * - 둘 다 선언(light + dark): effectiveScheme = userScheme, forceScheme = false
 *   → user Appearance 토글 그대로 작동.
 * - 한쪽만 선언: effectiveScheme = 그 scheme, forceScheme = true
 *   → chat scope에서 chrome도 그 쪽으로 강제.
 */
export function resolveThemeVars(
  theme: RendererTheme,
  userScheme: "light" | "dark",
): ResolvedThemeVars {
  const hasLight = !!theme.light;
  const hasDark = !!theme.dark;

  let effectiveScheme: "light" | "dark";
  let palette: RendererThemeTokens;
  let forceScheme: boolean;

  if (hasLight && hasDark) {
    effectiveScheme = userScheme;
    palette = userScheme === "dark" ? theme.dark! : theme.light!;
    forceScheme = false;
  } else if (hasDark) {
    effectiveScheme = "dark";
    palette = theme.dark!;
    forceScheme = true;
  } else {
    effectiveScheme = "light";
    palette = theme.light!;
    forceScheme = true;
  }

  const vars: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    vars[TOKEN_TO_CSS[key]] = palette[key];
  }

  return { vars, effectiveScheme, forceScheme };
}
