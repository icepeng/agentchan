import type { ProjectFile } from "@agentchan/creative-agent";
import type {
  RendererActions,
  RendererTheme,
  RendererThemeTokens,
  ResolvedThemeVars,
} from "@agentchan/renderer-runtime";
import type { AgentState } from "@/client/entities/agent-state/index.js";

export type {
  AgentState,
  ProjectFile,
  RendererActions,
  RendererTheme,
  RendererThemeTokens,
  ResolvedThemeVars,
};

// Host-specific RenderContext: narrower `state` type (the full AgentState from
// the agent-state entity) than `@agentchan/renderer-runtime`'s minimal duck
// shape. Templates declare their own inline RenderContext; defineRenderer's
// generic cast absorbs the difference at the boundary.
export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
  actions: RendererActions;
}

// Action wire format for BottomInput's dispatch handler. Not exposed to
// renderers — they only touch the imperative RendererActions interface.
export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
