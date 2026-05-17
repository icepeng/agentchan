import { FileText, FileCode, Image } from "lucide-react";
import { IMAGE_EXTS, type TreeEntry } from "./editor.types.js";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children: TreeNode[];
}

export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  for (const entry of entries) {
    if (entry.type === "dir") {
      dirs.set(entry.path, { name: entry.path.split("/").pop()!, path: entry.path, type: "dir", children: [] });
    }
  }

  for (const entry of entries) {
    const node: TreeNode = entry.type === "dir"
      ? dirs.get(entry.path)!
      : { name: entry.path.split("/").pop()!, path: entry.path, type: "file", children: [] };

    const parentPath = entry.path.includes("/") ? entry.path.substring(0, entry.path.lastIndexOf("/")) : null;

    if (parentPath && dirs.has(parentPath)) {
      dirs.get(parentPath)!.children.push(node);
    } else if (!parentPath) {
      root.push(node);
    }
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children);
    }
  }

  sortNodes(root);
  return root;
}

export function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return <Image size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
  if (ext === "ts" || ext === "js" || ext === "mjs" || ext === "mts") return <FileCode size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
  return <FileText size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
}
