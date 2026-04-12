import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FileCode,
  FolderOpen,
  FolderClosed,
  Image,
} from "lucide-react";
import { IMAGE_EXTS, type TreeEntry } from "@/client/entities/editor/index.js";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children: TreeNode[];
}

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  // Ensure parent dirs exist
  for (const entry of entries) {
    if (entry.type === "dir") {
      dirs.set(entry.path, { name: entry.path.split("/").pop()!, path: entry.path, type: "dir", children: [] });
    }
  }

  // Build hierarchy
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

  // Sort: dirs first, then alphabetical
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

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return <Image size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
  if (ext === "ts" || ext === "js" || ext === "mjs" || ext === "mts") return <FileCode size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
  return <FileText size={13} strokeWidth={2} className="flex-shrink-0 opacity-60" />;
}

interface FileTreeProps {
  entries: TreeEntry[];
  selectedPath: string | null;
  dirty: boolean;
  onSelect: (path: string) => void;
}

export function FileTree({ entries, selectedPath, dirty, onSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden py-2 text-[12px] select-none">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          dirtyPath={dirty ? selectedPath : null}
          collapsed={collapsed}
          onToggle={toggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  dirtyPath: string | null;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

function TreeItem({ node, depth, selectedPath, dirtyPath, collapsed, onToggle, onSelect }: TreeItemProps) {
  const isDir = node.type === "dir";
  const isCollapsed = collapsed.has(node.path);
  const isSelected = node.path === selectedPath;
  const isDirty = node.path === dirtyPath;

  if (isDir) {
    const FolderIcon = isCollapsed ? FolderClosed : FolderOpen;
    const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <>
        <button
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1 px-2 py-1 hover:bg-accent/8 text-fg-2 hover:text-fg transition-colors rounded-md"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronIcon size={12} strokeWidth={2} className="text-fg-4 flex-shrink-0" />
          <FolderIcon size={13} strokeWidth={2} className="text-accent/60 flex-shrink-0" />
          <span className="truncate ml-0.5">{node.name}</span>
        </button>
        {!isCollapsed && node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            dirtyPath={dirtyPath}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
        isSelected
          ? "bg-accent/12 text-accent"
          : "text-fg-2 hover:bg-accent/6 hover:text-fg"
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
      {isDirty && <span className="text-accent ml-auto flex-shrink-0">•</span>}
    </button>
  );
}
