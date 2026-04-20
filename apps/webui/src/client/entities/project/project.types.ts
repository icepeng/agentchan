import type { ProjectFile } from "@agentchan/creative-agent";

/** Project의 목적. 기본값은 "creative"(창작용). "workbench"는 새 템플릿 저작용 */
export type ProjectIntent = "creative" | "workbench";

export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
  intent?: ProjectIntent;
}

export type { ProjectFile };
