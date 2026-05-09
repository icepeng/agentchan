import type { ProjectFile } from "@agentchan/creative-agent/browser";

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
}

export type { ProjectFile };
