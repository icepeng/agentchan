import type { ProjectFile } from "@agentchan/creative-agent";

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
}

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
}

export type { ProjectFile };
