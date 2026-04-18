import type { ProjectFile } from "@agentchan/creative-agent";

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
}

export type { ProjectFile };

// --- Renderer theme ---

/**
 * 토큰 이름은 agentchan 전역 CSS 변수(`--color-*`)와 1:1로 대응한다.
 * 렌더러 작성자가 토큰을 선언하면 그대로 해당 `--color-*`가 오버라이드된다.
 */
export interface RendererThemeTokens {
  void?: string;
  base?: string;
  surface?: string;
  elevated?: string;
  accent?: string;
  fg?: string;
  fg2?: string;
  fg3?: string;
  edge?: string;
}

export interface RendererTheme {
  base: RendererThemeTokens;
  dark?: Partial<RendererThemeTokens>;
  prefersScheme?: "light" | "dark";
}

export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

// --- Renderer action (bridge from rendered HTML to chat) ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
