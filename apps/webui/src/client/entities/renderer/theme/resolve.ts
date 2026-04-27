import type {
  RendererTheme,
  RendererThemeTokens,
  ResolvedThemeVars,
} from "../renderer.types.js";
import { TOKEN_KEYS, TOKEN_TO_CSS } from "./tokens.js";

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
