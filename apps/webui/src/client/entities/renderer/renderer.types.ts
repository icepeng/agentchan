import type {
  BinaryFile,
  DataFile,
  ProjectFile,
  TextFile,
} from "@agentchan/creative-agent";
import type {
  AgentMessage,
  AssistantMessage,
} from "@/client/entities/agent-state/index.js";

export type { BinaryFile, DataFile, ProjectFile, TextFile };

export interface RendererAgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: readonly string[];
  readonly errorMessage?: string;
}

/** Renderer snapshot shared by AgentPanel UI and Renderer V1 modules. */
export interface RendererSnapshot {
  slug: string;
  baseUrl: string;
  files: readonly ProjectFile[];
  state: RendererAgentState;
}

export type RenderContext = RendererSnapshot;

export interface RendererActions {
  send(text: string): void | Promise<void>;
  fill(text: string): void | Promise<void>;
}

export interface RendererBundle {
  js: string;
  css: string[];
}

export interface RendererProps {
  snapshot: RendererSnapshot;
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

/** Output of `resolveThemeVars`, consumed by `<AppShell>`. */
export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

// --- Renderer action ---

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
