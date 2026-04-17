import type { TreeNode } from "./conversation.types.js";

/**
 * Splice a single node into a conversation tree (array-form), re-linking the
 * parent's `children` + `activeChildId`. The input array is not mutated.
 *
 * Used by the optimistic/write-through paths in `useStreaming` to mirror the
 * server's insert shape inside the SWR cache, so that re-renders see the
 * same tree the server will eventually return from `/conversations/:id`.
 *
 * Array order is NOT topological — consumers must index by id (e.g. nodeMap)
 * and traverse via `activePath` / `children`, never assume parents precede
 * children in the returned array.
 */
export function insertNode(nodes: readonly TreeNode[], node: TreeNode): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);
  byId.set(node.id, node);
  if (node.parentId) {
    const parent = byId.get(node.parentId);
    if (parent) {
      const children = parent.children ? [...parent.children] : [];
      if (!children.includes(node.id)) children.push(node.id);
      byId.set(parent.id, { ...parent, children, activeChildId: node.id });
    }
  }
  return [...byId.values()];
}

/**
 * Batch-insert version — constructs one Map, splices every node into it, then
 * materializes once. O(n + m) instead of `insertNode` called in a loop (which
 * is O(n*m)). Use this in `onAssistantNodes` where tool chains can deliver
 * 10+ nodes at once on top of an already-long conversation.
 */
export function insertNodes(nodes: readonly TreeNode[], toInsert: readonly TreeNode[]): TreeNode[] {
  if (toInsert.length === 0) return [...nodes];
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);
  for (const node of toInsert) {
    byId.set(node.id, node);
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    const children = parent.children ? [...parent.children] : [];
    if (!children.includes(node.id)) children.push(node.id);
    byId.set(parent.id, { ...parent, children, activeChildId: node.id });
  }
  return [...byId.values()];
}

/**
 * Swap a temp (optimistic) node for the real one the server echoed back.
 * Updates parent's `children` / `activeChildId` pointers so nothing dangles.
 */
export function replaceTempNode(
  nodes: readonly TreeNode[],
  tempId: string,
  real: TreeNode,
): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    if (n.id === tempId) continue;
    byId.set(n.id, n);
  }
  byId.set(real.id, real);
  if (real.parentId) {
    const parent = byId.get(real.parentId);
    if (parent) {
      const children = (parent.children ?? []).map((cid) =>
        cid === tempId ? real.id : cid,
      );
      if (!children.includes(real.id)) children.push(real.id);
      byId.set(parent.id, { ...parent, children, activeChildId: real.id });
    }
  }
  return [...byId.values()];
}
