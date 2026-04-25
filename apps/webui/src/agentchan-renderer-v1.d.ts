declare module "agentchan:renderer/v1" {
  import type {
    ProjectFile as AgentchanProjectFile,
    TextFile as AgentchanTextFile,
    DataFile as AgentchanDataFile,
    BinaryFile as AgentchanBinaryFile,
    RendererActions as AgentchanRendererActions,
    RendererAgentState as AgentchanRendererAgentState,
    RendererProps as AgentchanRendererProps,
    RendererSnapshot as AgentchanRendererSnapshot,
    RendererTheme as AgentchanRendererTheme,
  } from "@/client/entities/renderer/index.js";

  export namespace Agentchan {
    export type ProjectFile = AgentchanProjectFile;
    export type TextFile = AgentchanTextFile;
    export type DataFile = AgentchanDataFile;
    export type BinaryFile = AgentchanBinaryFile;
    export type RendererAgentState = AgentchanRendererAgentState;
    export type RendererActions = AgentchanRendererActions;
    export type RendererProps = AgentchanRendererProps;
    export type RendererSnapshot = AgentchanRendererSnapshot;
    export type RendererTheme = AgentchanRendererTheme;
  }

  export const Agentchan: {
    fileUrl(
      snapshot: AgentchanRendererSnapshot,
      fileOrPath: AgentchanProjectFile | string,
      options?: { digest?: string },
    ): string;
  };

  export default Agentchan;
}

declare module "agentchan:renderer/v1/jsx-runtime" {
  export const Fragment: symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare module "agentchan:renderer/v1/jsx-dev-runtime" {
  export const Fragment: symbol;
  export function jsxDEV(type: unknown, props: unknown, key?: unknown): unknown;
}
