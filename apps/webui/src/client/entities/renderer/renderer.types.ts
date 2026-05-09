import type {
  BinaryFile,
  DataFile,
  ProjectFile,
  TextFile,
} from "@agentchan/creative-agent/browser";
import type {
  RendererActions,
  RendererSnapshot,
} from "@agentchan/renderer/host";

export type { BinaryFile, DataFile, ProjectFile, TextFile };

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
