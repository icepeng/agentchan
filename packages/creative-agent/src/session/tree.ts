import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TreeNodeWithChildren } from "../types.js";

/**
 * Compute the active path through the tree, following activeChildId at each node.
 */
export function computeActivePath(
  nodes: Map<string, TreeNodeWithChildren>,
  rootNodeId: string,
): string[] {
  const path: string[] = [];
  let currentId: string | undefined = rootNodeId;

  while (currentId) {
    const node = nodes.get(currentId);
    if (!node) break;

    path.push(currentId);

    if (node.activeChildId && nodes.has(node.activeChildId)) {
      currentId = node.activeChildId;
    } else if (node.children.length > 0) {
      currentId = node.children[node.children.length - 1];
    } else {
      break;
    }
  }

  return path;
}

/**
 * Flatten a path of node IDs into a message array for agent input.
 */
export function flattenPathToMessages(
  nodes: Map<string, TreeNodeWithChildren>,
  path: string[],
): AgentMessage[] {
  return path.map((id) => nodes.get(id)!.message);
}

/**
 * Trace the path from root to a specific node.
 */
export function pathToNode(
  nodes: Map<string, TreeNodeWithChildren>,
  nodeId: string,
): string[] {
  const path: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    path.unshift(currentId);
    const node = nodes.get(currentId);
    if (!node) break;
    currentId = node.parentId;
  }

  return path;
}

/**
 * Update activeChildId chain for branch switching.
 * Walks up from target to root setting activeChildId, then down to find new leaf.
 */
export function switchBranch(
  nodes: Map<string, TreeNodeWithChildren>,
  targetNodeId: string,
): { updatedNodes: TreeNodeWithChildren[]; newLeafId: string } {
  const updatedNodes: TreeNodeWithChildren[] = [];
  let childId = targetNodeId;
  let parentId = nodes.get(targetNodeId)?.parentId ?? null;

  while (parentId) {
    const parent = nodes.get(parentId);
    if (!parent) break;

    if (parent.activeChildId !== childId) {
      parent.activeChildId = childId;
      updatedNodes.push(parent);
    }

    childId = parentId;
    parentId = parent.parentId;
  }

  // Walk down from target to find the leaf
  let leafId = targetNodeId;
  let current = nodes.get(leafId);
  while (current && current.children.length > 0) {
    const lastChild = current.children[current.children.length - 1]!;
    const nextId =
      current.activeChildId && nodes.has(current.activeChildId)
        ? current.activeChildId
        : lastChild;
    leafId = nextId;
    current = nodes.get(nextId);
  }

  return { updatedNodes, newLeafId: leafId };
}

/**
 * Generate a title from the first user message text.
 */
export function generateTitle(text: string): string {
  const trimmed = text.trim().replace(/\n/g, " ");
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;
}
