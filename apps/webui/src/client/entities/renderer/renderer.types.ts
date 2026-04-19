import type { ProjectFile } from "@agentchan/creative-agent";
import type { AgentState } from "@/client/entities/agent-state/index.js";

export type { AgentState, ProjectFile };

/**
 * Renderer contract — shared by AgentPanel UI and template renderer.ts.
 *
 * `state`는 pi `agent.state` 네이밍을 그대로 계승. 렌더러는 `state.messages`로
 * 전체 대화 흐름(persisted + in-flight toolResults)을, `state.streamingMessage`로
 * 현재 in-flight assistant message를 본다. tool 진행 여부는
 * `state.pendingToolCalls.has(toolCall.id)`로 판단.
 */
export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
}

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
