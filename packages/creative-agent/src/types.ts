// --- Re-export pi-ai/pi-agent-core message types as canonical persistence types ---

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionMode } from "./session/format.js";

export type { AgentMessage };

// --- Token usage (grouped, agentchan-specific roll-up) ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;
  contextTokens?: number;
}

// --- Session tree node ---

/**
 * Node meta tags drive UI rendering decisions in MessageBubble.
 *
 * `skill-load` — user node carrying a skill body, rendered as a chip.
 * `compact-summary` — system-generated summary node from a `compact` operation.
 */
export type NodeMeta = "skill-load" | "compact-summary";

/**
 * A node in the session tree. Wraps a pi-ai AgentMessage with tree
 * metadata (id, parentId, activeChildId) and agentchan-specific fields.
 */
export interface TreeNode {
  id: string;
  parentId: string | null;
  message: AgentMessage;
  createdAt: number;
  activeChildId?: string;
  usage?: TokenUsage;
  meta?: NodeMeta;
}

// --- Session metadata ---

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  activeLeafId: string;
  provider: string;
  model: string;
  compactedFrom?: string;
  /** Session mode. Omitted = creative (backward compatible). */
  mode?: SessionMode;
}

// --- In-memory tree representation ---

export interface TreeNodeWithChildren extends TreeNode {
  children: string[];
}
