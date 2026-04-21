import type { ProjectFile } from "@agentchan/creative-agent";
import type { AgentState } from "@/client/entities/agent-state/index.js";

export type { AgentState, ProjectFile };

/**
 * 렌더러는 same-origin iframe 안에서 실행된다. 호스트는 iframe 배치·부팅·정리만
 * 담당하고, DOM/스크롤/모션/리스너는 전부 렌더러가 소유한다.
 *
 * 엔트리는 `renderer/index.ts`에서 `mount(container, ctx)`를 export.
 * 반환된 handle의 `destroy()`는 프로젝트 전환·에디트 모드 진입·탭 unmount 시 호출된다.
 */
export interface MountContext {
  files: ProjectFile[];
  baseUrl: string;
  assetsUrl: string;
  state: AgentState;
  host: RendererHostApi;
}

export interface RendererHostApi {
  sendAction(action: RendererAction): void;
  setTheme(theme: RendererTheme | null): void;
  subscribeState(cb: (state: AgentState) => void): () => void;
  subscribeFiles(cb: (files: ProjectFile[]) => void): () => void;
  readonly version: 1;
}

export interface RendererHandle {
  destroy(): void;
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

// --- Renderer action ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
