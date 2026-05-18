import type {
  BinaryFile,
  DataFile,
  ProjectFile,
  TextFile,
} from "@agentchan/creative-agent/browser";
export type { BinaryFile, DataFile, ProjectFile, TextFile };
export type {
  RendererActions,
  RendererSnapshot,
  RendererTheme,
  RendererThemeTokens,
} from "@agentchan/renderer/host";

/** Output of `resolveThemeVars`, consumed by `<AppShell>`. */
export interface ResolvedThemeVars {
  vars: Record<string, string>;
  effectiveScheme: "light" | "dark";
  forceScheme: boolean;
}

export type RendererAction =
  | { type: "send"; text: string }
  | { type: "fill"; text: string };
