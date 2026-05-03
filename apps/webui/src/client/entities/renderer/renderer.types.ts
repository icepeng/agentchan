import type {
  BinaryFile,
  DataFile,
  ProjectFile,
  TextFile,
} from "@agentchan/creative-agent";
import type {
  RendererActions,
  RendererSnapshot,
} from "@agentchan/renderer/core";
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

export interface RendererProps {
  snapshot: RendererSnapshot;
  actions: RendererActions;
}

/** Output of `resolveThemeVars`, consumed by `<AppShell>`. */
export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
