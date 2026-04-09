/**
 * JSONL conversation file format: header + tree node lines.
 *
 * Pure data transforms — no fs, no LLM. Storage uses these to read/write
 * conversation files; nothing else should depend on this module.
 */

import type { TreeNode, TreeNodeWithChildren, Conversation } from "../types.js";
import { computeActivePath, generateTitle } from "./tree.js";

// --- Header ---

export interface ConversationHeader {
  _header: true;
  createdAt: number;
  provider: string;
  model: string;
  compactedFrom?: string;
}

// --- Parsing ---

export interface ParsedConversation {
  headerLine: string | null;
  header: ConversationHeader | null;
  nodes: TreeNode[];
}

export function parseConversationFile(content: string): ParsedConversation {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { headerLine: null, header: null, nodes: [] };

  let headerLine: string | null = null;
  let header: ConversationHeader | null = null;
  let startIdx = 0;
  try {
    const first = JSON.parse(lines[0]);
    if (first._header) {
      headerLine = lines[0];
      header = first as ConversationHeader;
      startIdx = 1;
    }
  } catch { /* not valid JSON — treat all as nodes */ }

  const nodes = lines.slice(startIdx).map((line) => JSON.parse(line) as TreeNode);
  return { headerLine, header, nodes };
}

export function buildTreeMap(nodes: TreeNode[]): Map<string, TreeNodeWithChildren> {
  const map = new Map<string, TreeNodeWithChildren>();
  for (const node of nodes) map.set(node.id, { ...node, children: [] });
  for (const node of map.values()) {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node.id);
    }
  }
  return map;
}

// --- Derivation: header + nodes → Conversation metadata ---

export function deriveConversation(
  id: string,
  header: ConversationHeader | null,
  nodes: TreeNode[],
  tree?: Map<string, TreeNodeWithChildren>,
): Conversation {
  const firstUser = nodes.find((n) => n.role === "user");
  const title = firstUser
    ? generateTitle(firstUser.content.find((b) => b.type === "text" && "text" in b)?.text ?? "")
    : "New conversation";

  const createdAt = header?.createdAt ?? nodes[0]?.createdAt ?? Date.now();
  const updatedAt = nodes.length > 0 ? nodes[nodes.length - 1].createdAt : createdAt;

  const rootNode = nodes.find((n) => n.parentId === null);
  const rootNodeId = rootNode?.id ?? "";

  let activeLeafId = "";
  if (rootNodeId) {
    const treeMap = tree ?? buildTreeMap(nodes);
    const path = computeActivePath(treeMap, rootNodeId);
    activeLeafId = path.length > 0 ? path[path.length - 1] : "";
  }

  // Backward search — avoids copying the array
  let lastAssistant: TreeNode | undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].role === "assistant") { lastAssistant = nodes[i]; break; }
  }
  const provider = lastAssistant?.provider ?? header?.provider ?? "";
  const model = lastAssistant?.model ?? header?.model ?? "";

  return {
    id, title, createdAt, updatedAt, rootNodeId, activeLeafId, provider, model,
    ...(header?.compactedFrom ? { compactedFrom: header.compactedFrom } : {}),
  };
}

// --- Serialization ---

/**
 * Render a conversation tree back to JSONL text. Storage writes the result
 * with `writeFile` — separating serialization here keeps fs out of format/.
 */
export function serializeConversation(
  headerLine: string | null,
  tree: Map<string, TreeNodeWithChildren>,
): string {
  const allNodes = [...tree.values()].map(({ children, ...node }) => node);
  const nodeContent = allNodes.map((n) => JSON.stringify(n)).join("\n") + "\n";
  return headerLine ? headerLine + "\n" + nodeContent : nodeContent;
}
