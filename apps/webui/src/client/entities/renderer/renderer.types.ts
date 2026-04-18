import type { ProjectFile } from "@agentchan/creative-agent";

/**
 * 렌더러에 노출되는 스트림 상태의 **좁힌 view**. 내부 `StreamSlot`에 새 필드가
 * 추가돼도 `toRenderStream` 매퍼를 통과하지 않는 한 렌더러에 자동 노출되지
 * 않는다. idle 시점에는 `EMPTY_RENDER_STREAM`이 들어간다.
 */
export interface RenderStreamView {
  isStreaming: boolean;
  text: string;
  toolCalls: ReadonlyArray<RenderToolCallView>;
}

/**
 * 도구 호출 수명주기의 선형 phase markers 둘 + 완료 sentinel(`result`).
 *
 * - `argsComplete=F`                                 → 입력 JSON 스트리밍 중
 * - `argsComplete=T, executionStarted=F`             → 실행 준비 중
 * - `argsComplete=T, executionStarted=T, result===undefined` → 실행 중
 * - `result !== undefined`                            → 완료 (`result.isError`로 성공/실패)
 *
 * 편의: `!tc.result`로 "아직 진행 중인 도구"를 골라낼 수 있다.
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

export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

// --- Renderer action (bridge from rendered HTML to chat) ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
