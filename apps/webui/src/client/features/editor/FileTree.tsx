import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
} from "lucide-react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { buildTree, FileIcon, type TreeNode } from "@/client/entities/editor/index.js";
import type { TreeEntry } from "@/client/entities/editor/index.js";
import { useI18n } from "@/client/i18n/index.js";

const MENU_POPUP_CLASS =
  "bg-elevated border border-edge/8 rounded-lg shadow-lg shadow-void/50 py-1 z-50";
const MENU_ITEM_CLASS =
  "px-4 py-1.5 text-sm text-fg-2 cursor-pointer outline-none data-[highlighted]:bg-accent/10";
const MENU_ITEM_DANGER_CLASS =
  "px-4 py-1.5 text-sm text-danger cursor-pointer outline-none data-[highlighted]:bg-danger/10";

interface FileTreeProps {
  entries: TreeEntry[];
  selectedPath: string | null;
  dirty: boolean;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onReveal: (path: string) => void;
}

export function FileTree({ entries, selectedPath, dirty, onSelect, onDelete, onReveal }: FileTreeProps) {
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
          onDelete={onDelete}
          onReveal={onReveal}
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
  onDelete: (path: string) => void;
  onReveal: (path: string) => void;
}

function TreeItem({ node, depth, selectedPath, dirtyPath, collapsed, onToggle, onSelect, onDelete, onReveal }: TreeItemProps) {
  const { t } = useI18n();
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
            onDelete={onDelete}
            onReveal={onReveal}
          />
        ))}
      </>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <button
            onClick={() => onSelect(node.path)}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
              isSelected
                ? "bg-accent/12 text-accent"
                : "text-fg-2 hover:bg-accent/6 hover:text-fg"
            }`}
            style={{ paddingLeft: `${depth * 12 + 20}px` }}
          />
        }
      >
        <FileIcon name={node.name} />
        <span className="truncate">{node.name}</span>
        {isDirty && <span className="text-accent ml-auto flex-shrink-0">•</span>}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={4}>
          <ContextMenu.Popup className={MENU_POPUP_CLASS}>
            <ContextMenu.Item
              onClick={() => onReveal(node.path)}
              className={MENU_ITEM_CLASS}
            >
              {t("editMode.revealInExplorer")}
            </ContextMenu.Item>
            <ContextMenu.Item
              onClick={() => onDelete(node.path)}
              className={MENU_ITEM_DANGER_CLASS}
            >
              {t("editMode.deleteFile")}
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
