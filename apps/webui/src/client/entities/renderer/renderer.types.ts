import type {
  BinaryFile,
  DataFile,
  ProjectFile,
  TextFile,
} from "@agentchan/creative-agent";
import type {
  RendererActions,
  RendererSnapshot,
  Message,
  AssistantMessage,
} from "@agentchan/renderer/core";

export type { BinaryFile, DataFile, ProjectFile, TextFile };

export interface RendererAgentState {
  readonly messages: ReadonlyArray<Message>;
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
