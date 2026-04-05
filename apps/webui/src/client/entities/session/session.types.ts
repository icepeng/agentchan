import type { ContentBlock, TokenUsage } from "@agentchan/creative-agent";

export type { ContentBlock, TokenUsage };

export interface TreeNode {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: ContentBlock[];
  createdAt: number;
  provider?: string;
  model?: string;
  activeChildId?: string;
  children?: string[];
  usage?: TokenUsage;
  meta?: "compact-summary" | (string & {});
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  activeLeafId: string;
  provider: string;
  model: string;
  compactedFrom?: string;
}

export interface ToolCallState {
  id: string;
  name: string;
  inputJson: string;
  done: boolean;
  executing?: boolean;
  parallel?: boolean;
}
