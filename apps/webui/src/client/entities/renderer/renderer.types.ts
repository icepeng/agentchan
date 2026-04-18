import type { ProjectFile } from "@agentchan/creative-agent";

/** Narrowed stream view exposed to renderers. Idle = `EMPTY_RENDER_STREAM`. */
export interface RenderStreamView {
  isStreaming: boolean;
  text: string;
  toolCalls: ReadonlyArray<RenderToolCallView>;
}

/**
 * Tool-call lifecycle for renderers. Check `!tc.result` for "still running"
 * (covers both streaming-args and executing phases).
 */
export interface RenderToolCallView {
  id: string;
  name: string;
  argsComplete: boolean;
  executionStarted: boolean;
  result?: { isError: boolean };
}

export const EMPTY_RENDER_STREAM: RenderStreamView = {
  isStreaming: false,
  text: "",
  toolCalls: [],
};

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  stream: RenderStreamView;
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

/** Output of `resolveThemeVars`, consumed by `<AppShell>`. */
export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

// --- Renderer action (bridge from rendered HTML to chat) ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
