// --- Canonical content blocks (persistence format) ---

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; providerMetadata?: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; text: string };

// --- Canonical message (for tree storage) ---

export interface StoredMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

// --- Token usage (grouped) ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;
  contextTokens?: number;
}

// --- Conversation tree node ---

export interface TreeNode {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: ContentBlock[];
  createdAt: number;
  provider?: string;
  model?: string;
  activeChildId?: string;
  usage?: TokenUsage;
  meta?: string;
}

// --- Conversation metadata ---

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

// --- In-memory tree representation ---

export interface TreeNodeWithChildren extends TreeNode {
  children: string[];
}
