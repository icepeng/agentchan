import type { RendererTheme, RendererThemeTokens } from "@agentchan/renderer-types";

export type { RendererTheme, RendererThemeTokens };

const TOKEN_TO_CSS: Record<keyof RendererThemeTokens, string> = {
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

const TOKEN_KEYS = Object.keys(TOKEN_TO_CSS) as (keyof RendererThemeTokens)[];

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

export interface ResolvedThemeVars {
  /** 주입할 CSS custom property 맵. CSSProperties로 캐스팅해서 `style`에 꽂는다. */
  vars: Record<string, string>;
  /** 이 테마가 유도하는 실효 scheme. prefersScheme 강제 시 사용. */
  effectiveScheme: "light" | "dark";
  /** 사용자의 scheme과 실제 적용 scheme이 어긋나는가? (data-theme override 필요성) */
  forceScheme: boolean;
}

/**
 * 사용자의 현재 scheme과 theme 선언을 합쳐 실제 주입할 CSS 변수와 실효 scheme을 계산한다.
 *
 * - 듀얼 모드(base + dark): effectiveScheme = prefersScheme ?? userScheme
 * - 단일 모드(base only): effectiveScheme = prefersScheme ?? "light"
 *   → prefersScheme 없으면 base를 light로 가정 (data-theme 강제 안 함 — 사용자 토글 유지)
 * - `forceScheme`은 prefersScheme이 명시됐거나, 단일 모드인데 사용자 scheme이 base 가정과 다른 경우에만 true
 */
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

  const forceScheme = theme.prefersScheme !== undefined;

  return { vars, effectiveScheme, forceScheme };
}
