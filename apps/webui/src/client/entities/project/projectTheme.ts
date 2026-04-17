import type { RenderContext } from "./project.types.js";

/**
 * Renderer-owned theme: 렌더러가 프로젝트 페이지 한정으로 전역 CSS custom property를
 * 오버라이드할 수 있도록 하는 계약.
 *
 * - 색상 전용. 폰트는 렌더러 자체 `<style>` 안에서 `font-family`로 직접 지정한다.
 * - `base`만 있으면 단일 모드, `dark`가 있으면 듀얼 모드.
 * - `prefersScheme`이 명시되면 프로젝트 페이지에서만 사용자 Appearance 토글을 강제 오버라이드.
 * - `theme` export는 정적 객체 또는 `(ctx: RenderContext) => RendererTheme` 함수 둘 다 지원.
 *   함수면 매 refresh마다 현재 files를 보고 팔레트를 다르게 반환할 수 있다 (예: 전투/평시 분기).
 */

/**
 * 토큰 이름은 agentchan 전역 CSS 변수(`--color-*`)와 1:1로 대응한다.
 * 렌더러 작성자가 토큰을 선언하면 그대로 해당 `--color-*`가 오버라이드된다.
 */
export interface RendererThemeTokens {
  void?: string; // --color-void     (앱 최상위 배경)
  base?: string; // --color-base     (Sidebar / AgentPanel / BottomInput)
  surface?: string; // --color-surface  (카드 / 인풋 박스)
  elevated?: string; // --color-elevated (hover / 강조)
  accent?: string; // --color-accent   (포인트 색)
  fg?: string; // --color-fg       (본문 텍스트)
  fg2?: string; // --color-fg-2     (메타 텍스트 / 아이콘 기본)
  fg3?: string; // --color-fg-3     (부드러운 텍스트)
  edge?: string; // --color-edge     (테두리 베이스)
}

export interface RendererTheme {
  base: RendererThemeTokens;
  /** base(=light) 위에 덮어쓰는 dark 토큰. 생략하면 base 단일 모드. */
  dark?: Partial<RendererThemeTokens>;
  /** 명시되면 프로젝트 페이지 안에서 사용자 토글과 무관하게 해당 scheme으로 강제 고정. */
  prefersScheme?: "light" | "dark";
}

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

/**
 * 렌더러 모듈의 `theme` export가 함수면 RenderContext를 넘겨 호출하고,
 * 그 외에는 값을 그대로 통과시킨다. 함수가 throw하면 warn 후 null을 반환.
 *
 * 반환값은 아직 "검증되지 않은 raw"이므로 반드시 `validateTheme`을 거쳐야 한다.
 */
export function resolveRawTheme(raw: unknown, ctx: RenderContext): unknown {
  if (typeof raw !== "function") return raw;
  try {
    return (raw as (ctx: RenderContext) => unknown)(ctx);
  } catch (e) {
    console.warn("[renderer.theme] theme function threw", e);
    return null;
  }
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
