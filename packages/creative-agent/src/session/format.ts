/**
 * JSONL session file format: header + tree node lines.
 *
 * Pure data transforms — no fs, no LLM. Storage uses these to read/write
 * session files; nothing else should depend on this module.
 */

import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { TreeNode, TreeNodeWithChildren, Session } from "../types.js";
import { computeActivePath, generateTitle } from "./tree.js";

// --- Header ---

export type SessionMode = "creative" | "meta";

/** Session file format version. Bump when on-disk shape changes. */
export const CURRENT_SESSION_VERSION = 1;

export interface SessionHeader {
  _header: true;
  version: number;
  createdAt: number;
  provider: string;
  model: string;
  compactedFrom?: string;
  /** Session mode. Omitted = creative (backward compatible). */
  mode?: SessionMode;
}

// --- Parsing ---

export interface ParsedSession {
  headerLine: string | null;
  header: SessionHeader | null;
  nodes: TreeNode[];
}

/** Branch marker appended by switchBranch (append-only alternative to file rewrite). */
export interface BranchMarker {
  _marker: "branch";
  nodeId: string;
  activeChildId: string;
}

export function parseSessionFile(content: string): ParsedSession {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { headerLine: null, header: null, nodes: [] };

  let headerLine: string | null = null;
  let header: SessionHeader | null = null;
  let startIdx = 0;
  const firstLine = lines[0];
  try {
    const first = JSON.parse(firstLine!);
    if (first._header) {
      headerLine = firstLine!;
      // Pre-versioning files match the v1 shape; never bump this with CURRENT_SESSION_VERSION.
      header = { version: 1, ...first } as SessionHeader;
      startIdx = 1;
    }
  } catch { /* not valid JSON — treat all as nodes */ }

  const nodes: TreeNode[] = [];
  const branchMarkers: BranchMarker[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parsed = JSON.parse(line);
    if (parsed._marker === "branch") {
      branchMarkers.push(parsed as BranchMarker);
    } else {
      nodes.push(parsed as TreeNode);
    }
  }

  // Apply branch markers to set activeChildId on the referenced nodes
  if (branchMarkers.length > 0) {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const marker of branchMarkers) {
      const node = nodeMap.get(marker.nodeId);
      if (node) node.activeChildId = marker.activeChildId;
    }
  }

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

// --- Helpers ---

/** Extract user-visible text from a message for title generation. */
function extractUserText(node: TreeNode): string {
  const msg = node.message;
  if (msg.role !== "user") return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b): b is TextContent => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

// --- Derivation: header + nodes → Session metadata ---

export function deriveSession(
  id: string,
  header: SessionHeader | null,
  nodes: TreeNode[],
  tree?: Map<string, TreeNodeWithChildren>,
): Session {
  const firstUser = nodes.find((n) => n.message.role === "user");
  const title = firstUser
    ? generateTitle(extractUserText(firstUser))
    : "New session";

  const createdAt = header?.createdAt ?? nodes[0]?.createdAt ?? Date.now();
  const updatedAt = nodes[nodes.length - 1]?.createdAt ?? createdAt;

  const rootNode = nodes.find((n) => n.parentId === null);
  const rootNodeId = rootNode?.id ?? "";

  let activeLeafId = "";
  if (rootNodeId) {
    const treeMap = tree ?? buildTreeMap(nodes);
    const path = computeActivePath(treeMap, rootNodeId);
    activeLeafId = path[path.length - 1] ?? "";
  }

  // Backward search — avoids copying the array
  let lastAssistant: TreeNode | undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node && node.message.role === "assistant") { lastAssistant = node; break; }
  }
  const assistantMsg = lastAssistant?.message as AssistantMessage | undefined;
  const provider = assistantMsg?.provider ?? header?.provider ?? "";
  const model = assistantMsg?.model ?? header?.model ?? "";

  return {
    id, title, createdAt, updatedAt, rootNodeId, activeLeafId, provider, model,
    ...(header?.compactedFrom ? { compactedFrom: header.compactedFrom } : {}),
    ...(header?.mode ? { mode: header.mode } : {}),
  };
}

// --- Serialization ---

/**
 * Render a session tree back to JSONL text. Storage writes the result
 * with `writeFile` — separating serialization here keeps fs out of format/.
 */
export function serializeSession(
  headerLine: string | null,
  tree: Map<string, TreeNodeWithChildren>,
): string {
  const allNodes = [...tree.values()].map(({ children, ...node }) => node);
  const nodeContent = allNodes.map((n) => JSON.stringify(n)).join("\n") + "\n";
  return headerLine ? headerLine + "\n" + nodeContent : nodeContent;
}
