import type { TreeNode } from "@/client/entities/session/index.js";

export type BubbleGroup =
  | { kind: "user"; node: TreeNode }
  | { kind: "assistantTurn"; nodes: TreeNode[] };

export function groupActivePath(
  activePath: readonly string[],
  nodes: Map<string, TreeNode>,
): BubbleGroup[] {
  const groups: BubbleGroup[] = [];
  for (const nodeId of activePath) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    if (node.message.role === "user") {
      groups.push({ kind: "user", node });
      continue;
    }
    const prev = groups[groups.length - 1];
    if (prev && prev.kind === "assistantTurn") {
      prev.nodes.push(node);
    } else {
      groups.push({ kind: "assistantTurn", nodes: [node] });
    }
  }
  return groups;
}
