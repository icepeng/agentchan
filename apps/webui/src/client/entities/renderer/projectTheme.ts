import type {
  RendererTheme,
  RendererThemeTokens,
  ResolvedThemeVars,
} from "./renderer.types.js";

/**
 * 렌더러가 호출하는 `host.setTheme(theme)`에 의해 프로젝트 페이지 한정으로
 * 전역 CSS custom property를 오버라이드한다.
 *
 * - 색상 전용. 폰트는 렌더러 자체 `<style>` 안에서 `font-family`로 직접 지정.
 * - `base`만 있으면 단일 모드, `dark`가 있으면 듀얼 모드.
 * - `prefersScheme`이 명시되면 프로젝트 페이지에서만 사용자 Appearance 토글을 강제 오버라이드.
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
 * 렌더러가 `host.setTheme(raw)`로 넘긴 값을 검증한다.
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

function tokensEqual(
  a: RendererThemeTokens | undefined,
  b: RendererThemeTokens | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k of TOKEN_KEYS) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * 렌더러가 rAF 주기로 `setTheme(new object with same values)`를 호출해도
 * 호스트 상태 dispatch를 스킵해 AppShell re-render를 피한다.
 */
export function sameTheme(
  a: RendererTheme | null,
  b: RendererTheme | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.prefersScheme !== b.prefersScheme) return false;
  if (!tokensEqual(a.base, b.base)) return false;
  return tokensEqual(a.dark, b.dark);
}

/**
 * 사용자의 현재 scheme과 theme 선언을 합쳐 실제 주입할 CSS 변수와 실효 scheme을 계산.
 *
 * - 듀얼 모드(base + dark): effectiveScheme = prefersScheme ?? userScheme
 * - 단일 모드(base only): effectiveScheme = prefersScheme ?? "light"
 * - `forceScheme`은 prefersScheme이 명시된 경우에만 true
 */
/**
 * 같은 토큰 팔레트를 host document와 iframe contentDocument 양쪽에 적용해야 하므로,
 * "root에 CSS variable 쓰기/지우기"를 한 지점에서 관리. theme=null이면 전체 clear.
 */
export function applyThemeVars(
  root: HTMLElement,
  theme: RendererTheme | null,
  userScheme: "light" | "dark",
): void {
  for (const cssVar of Object.values(TOKEN_TO_CSS)) {
    root.style.removeProperty(cssVar);
  }
  root.removeAttribute("data-theme");
  if (!theme) return;
  const resolved = resolveThemeVars(theme, userScheme);
  for (const [key, value] of Object.entries(resolved.vars)) {
    root.style.setProperty(key, value);
  }
  if (resolved.forceScheme) {
    root.setAttribute("data-theme", resolved.effectiveScheme);
  }
}

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
