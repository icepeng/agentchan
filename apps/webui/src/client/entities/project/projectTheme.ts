/**
 * Renderer-owned theme: 렌더러가 프로젝트 페이지 한정으로 전역 CSS custom property를
 * 오버라이드할 수 있도록 하는 계약.
 *
 * - 색상 전용. 폰트는 렌더러 자체 `<style>` 안에서 `font-family`로 직접 지정한다.
 * - `base`만 있으면 단일 모드, `dark`가 있으면 듀얼 모드.
 * - `prefersScheme`이 명시되면 프로젝트 페이지에서만 사용자 Appearance 토글을 강제 오버라이드.
 */

export interface RendererThemeTokens {
  background?: string; // --color-void    (앱 최상위 배경)
  surface?: string; // --color-base    (Sidebar / AgentPanel / BottomInput 베이스)
  elevated?: string; // --color-surface (카드 / 인풋 박스)
  raised?: string; // --color-elevated (hover / 강조)
  accent?: string; // --color-accent  (포인트 색)
  foreground?: string; // --color-fg      (본문 텍스트)
  foregroundMuted?: string; // --color-fg-3    (부드러운 텍스트)
  border?: string; // --color-edge    (테두리 베이스)
}

export interface RendererTheme {
  base: RendererThemeTokens;
  /** base(=light) 위에 덮어쓰는 dark 토큰. 생략하면 base 단일 모드. */
  dark?: Partial<RendererThemeTokens>;
  /** 명시되면 프로젝트 페이지 안에서 사용자 토글과 무관하게 해당 scheme으로 강제 고정. */
  prefersScheme?: "light" | "dark";
}

const TOKEN_TO_CSS: Record<keyof RendererThemeTokens, string> = {
  background: "--color-void",
  surface: "--color-base",
  elevated: "--color-surface",
  raised: "--color-elevated",
  accent: "--color-accent",
  foreground: "--color-fg",
  foregroundMuted: "--color-fg-3",
  border: "--color-edge",
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
