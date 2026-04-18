import type { ProjectFile } from "@agentchan/creative-agent";

/**
 * 렌더러에 노출되는 스트림 상태의 **좁힌 view**. `entities/stream`의 내부
 * `StreamSlot`과 구조가 일부 겹치지만 별개 타입으로 유지한다 — 내부 필드
 * (`streamError`, `streamUsageDelta`, `inputJson` 등) 추가가 렌더러 계약 변경
 * 없이 가능하도록 `toRenderStream` mapper가 유일한 다리 역할을 한다.
 *
 * idle 시점에는 `EMPTY_RENDER_STREAM` (isStreaming=false, text="", toolCalls=[])이
 * 들어간다. 렌더러는 `ctx.stream.isStreaming`으로 스트리밍 중 여부를 판단한다.
 */
export interface RenderStreamView {
  isStreaming: boolean;
  text: string;
  toolCalls: ReadonlyArray<RenderToolCallView>;
}

/**
 * `streaming`: 모델이 tool_use 블록의 입력 JSON을 아직 스트리밍 중.
 * `executing`: JSON 수신 완료, 도구 실행 중.
 * `done`: 실행 완료.
 */
export interface RenderToolCallView {
  id: string;
  name: string;
  status: "streaming" | "executing" | "done";
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
