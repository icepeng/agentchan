import type { ProjectFile } from "@agentchan/creative-agent";
import type { RendererActions } from "@agentchan/renderer-runtime";
import type { AgentState } from "@/client/entities/agent-state/index.js";

export type { AgentState, ProjectFile, RendererActions };

/**
 * Renderer contract — shared by AgentPanel UI and template renderer.ts.
 *
 * `actions`는 호스트 → 렌더러 출구. send(text)/fill(text) 호출이 입력창에
 * 채워지거나 즉시 전송된다. data-action 속성은 같은 effect로 처리되며,
 * `@agentchan/renderer-runtime`의 `bindActions`가 위임한다.
 */
export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
  actions: RendererActions;
}

// --- Renderer theme ---

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

// --- Renderer action wire format (kept for BottomInput dispatch handler) ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
