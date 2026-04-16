import type { ProjectFile, RenderContext } from "@agentchan/renderer-types";

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
}

export type { ProjectFile, RenderContext };
