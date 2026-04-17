import type { ProjectFile } from "@agentchan/creative-agent";

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
}

export interface RenderPendingToolCall {
  id: string;
  name: string;
  done: boolean;
  executing?: boolean;
}

export interface RenderPendingState {
  isStreaming: boolean;
  streamingText: string;
  toolCalls: RenderPendingToolCall[];
}

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  pending?: RenderPendingState;
}

export type { ProjectFile };
