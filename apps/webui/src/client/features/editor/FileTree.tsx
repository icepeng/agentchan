import { useState, useEffect, useRef } from "react";
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
import { ScrollArea } from "@/client/shared/ui/index.js";

const MENU_POPUP_CLASS =
  "bg-elevated border border-edge/8 rounded-lg shadow-lg shadow-void/50 py-1 z-50";
const MENU_ITEM_CLASS =
  "px-4 py-1.5 text-sm text-fg-2 cursor-pointer outline-none data-[highlighted]:bg-accent/10";
const MENU_ITEM_DANGER_CLASS =
  "px-4 py-1.5 text-sm text-danger cursor-pointer outline-none data-[highlighted]:bg-danger/10";
const MENU_SEPARATOR_CLASS = "my-1 border-t border-edge/8";

type InlineEdit =
  | { mode: "new-file"; parentPath: string | null }
  | { mode: "new-dir"; parentPath: string | null }
  | { mode: "rename"; path: string; currentName: string }
  | null;

interface FileTreeProps {
  entries: TreeEntry[];
  selectedPath: string | null;
  dirty: boolean;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteDir: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onCreateFile: (dirPath: string | null, fileName: string) => void;
  onCreateDir: (dirPath: string | null, dirName: string) => void;
}

export function FileTree({
  entries, selectedPath, dirty,
  onSelect, onDelete, onDeleteDir, onReveal, onRename, onCreateFile, onCreateDir,
}: FileTreeProps) {
  const { t } = useI18n();
  const tree = buildTree(entries);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null);

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandFolder = (path: string) => {
    setCollapsed((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const startNewFile = (parentPath: string | null) => {
    if (parentPath) expandFolder(parentPath);
    setInlineEdit({ mode: "new-file", parentPath });
  };

  const startNewDir = (parentPath: string | null) => {
    if (parentPath) expandFolder(parentPath);
    setInlineEdit({ mode: "new-dir", parentPath });
  };

  const startRename = (path: string, currentName: string) => {
    setInlineEdit({ mode: "rename", path, currentName });
  };

  const cancelInline = () => {
    setInlineEdit(null);
  };

  const commitInline = (value: string) => {
    if (!inlineEdit) return;
    const name = value.trim();
    if (!name || name.includes("/") || name.includes("\\")) {
      setInlineEdit(null);
      return;
    }

    if (inlineEdit.mode === "new-file") {
      onCreateFile(inlineEdit.parentPath, name);
    } else if (inlineEdit.mode === "new-dir") {
      onCreateDir(inlineEdit.parentPath, name);
    } else if (inlineEdit.mode === "rename") {
      if (name !== inlineEdit.currentName) {
        onRename(inlineEdit.path, name);
      }
    }
    setInlineEdit(null);
  };

  const rootInline = inlineEdit && inlineEdit.mode !== "rename" && inlineEdit.parentPath === null;

  return (
    <ScrollArea className="h-full" viewportClassName="py-2 text-[12px] select-none flex flex-col">
      <div className="flex-1">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            dirtyPath={dirty ? selectedPath : null}
            collapsed={collapsed}
            inlineEdit={inlineEdit}
            onToggle={toggle}
            onSelect={onSelect}
            onDelete={onDelete}
            onDeleteDir={onDeleteDir}
            onReveal={onReveal}
            onStartNewFile={startNewFile}
            onStartNewDir={startNewDir}
            onStartRename={startRename}
            onCommitInline={commitInline}
            onCancelInline={cancelInline}
          />
        ))}
        {rootInline && (
          <InlineInput
            depth={0}
            defaultValue={inlineEdit.mode === "new-file" ? ".md" : ""}
            selectRange={inlineEdit.mode === "new-file" ? [0, 0] : undefined}
            icon={inlineEdit.mode === "new-file" ? "file" : "folder"}
            onCommit={commitInline}
            onCancel={cancelInline}
          />
        )}
      </div>
      {/* Empty area for root-level context menu */}
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={<div className="min-h-[40px] flex-shrink-0" />}
        />
        <ContextMenu.Portal>
          <ContextMenu.Positioner sideOffset={4}>
            <ContextMenu.Popup className={MENU_POPUP_CLASS}>
              <ContextMenu.Item onClick={() => startNewFile(null)} className={MENU_ITEM_CLASS}>
                {t("editMode.newFile")}
              </ContextMenu.Item>
              <ContextMenu.Item onClick={() => startNewDir(null)} className={MENU_ITEM_CLASS}>
                {t("editMode.newFolder")}
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </ScrollArea>
  );
}

interface InlineInputProps {
  depth: number;
  defaultValue: string;
  selectRange?: [number, number];
  icon: "file" | "folder";
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function InlineInput({ depth, defaultValue, selectRange, icon, onCommit, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    // Delay focus to next frame so context menu closing doesn't steal it back
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (selectRange) {
        el.setSelectionRange(selectRange[0], selectRange[1]);
      } else {
        el.select();
      }
      mountedRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [selectRange]);

  const handleCommit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(inputRef.current?.value ?? "");
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${icon === "folder" ? depth * 12 + 8 : depth * 12 + 20}px` }}
    >
      {icon === "folder"
        ? <FolderOpen size={13} strokeWidth={2} className="text-accent/60 flex-shrink-0 ml-[14px]" />
        : <FileIcon name={defaultValue || "file.md"} />
      }
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        className="flex-1 min-w-0 bg-transparent border border-accent/40 rounded px-1 py-0 text-fg text-[12px] outline-none focus:border-accent"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          // Ignore blur before mount completes (context menu closing can steal focus)
          if (!mountedRef.current) return;
          if (!committedRef.current) onCancel();
        }}
      />
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  dirtyPath: string | null;
  collapsed: Set<string>;
  inlineEdit: InlineEdit;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteDir: (path: string) => void;
  onReveal: (path: string) => void;
  onStartNewFile: (parentPath: string | null) => void;
  onStartNewDir: (parentPath: string | null) => void;
  onStartRename: (path: string, currentName: string) => void;
  onCommitInline: (value: string) => void;
  onCancelInline: () => void;
}

function TreeItem({
  node, depth, selectedPath, dirtyPath, collapsed, inlineEdit,
  onToggle, onSelect, onDelete, onDeleteDir, onReveal,
  onStartNewFile, onStartNewDir, onStartRename, onCommitInline, onCancelInline,
}: TreeItemProps) {
  const { t } = useI18n();
  const isDir = node.type === "dir";
  const isCollapsed = collapsed.has(node.path);
  const isSelected = node.path === selectedPath;
  const isDirty = node.path === dirtyPath;

  const isRenaming = inlineEdit?.mode === "rename" && inlineEdit.path === node.path;
  const showChildInline = isDir && !isCollapsed && inlineEdit && inlineEdit.mode !== "rename" && inlineEdit.parentPath === node.path;

  if (isRenaming) {
    const ext = node.name.includes(".") ? node.name.lastIndexOf(".") : node.name.length;
    return (
      <InlineInput
        depth={depth}
        defaultValue={node.name}
        selectRange={[0, ext]}
        icon={isDir ? "folder" : "file"}
        onCommit={onCommitInline}
        onCancel={onCancelInline}
      />
    );
  }

  if (isDir) {
    const FolderIcon = isCollapsed ? FolderClosed : FolderOpen;
    const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <>
        <ContextMenu.Root>
          <ContextMenu.Trigger
            render={
              <button
                onClick={() => onToggle(node.path)}
                className="w-full flex items-center gap-1 px-2 py-1 hover:bg-accent/8 text-fg-2 hover:text-fg transition-colors rounded-md"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              />
            }
          >
            <ChevronIcon size={12} strokeWidth={2} className="text-fg-4 flex-shrink-0" />
            <FolderIcon size={13} strokeWidth={2} className="text-accent/60 flex-shrink-0" />
            <span className="truncate ml-0.5">{node.name}</span>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner sideOffset={4}>
              <ContextMenu.Popup className={MENU_POPUP_CLASS}>
                <ContextMenu.Item onClick={() => onStartNewFile(node.path)} className={MENU_ITEM_CLASS}>
                  {t("editMode.newFile")}
                </ContextMenu.Item>
                <ContextMenu.Item onClick={() => onStartNewDir(node.path)} className={MENU_ITEM_CLASS}>
                  {t("editMode.newFolder")}
                </ContextMenu.Item>
                <div className={MENU_SEPARATOR_CLASS} />
                <ContextMenu.Item onClick={() => onStartRename(node.path, node.name)} className={MENU_ITEM_CLASS}>
                  {t("editMode.rename")}
                </ContextMenu.Item>
                <ContextMenu.Item onClick={() => onReveal(node.path)} className={MENU_ITEM_CLASS}>
                  {t("editMode.revealInExplorer")}
                </ContextMenu.Item>
                <div className={MENU_SEPARATOR_CLASS} />
                <ContextMenu.Item onClick={() => onDeleteDir(node.path)} className={MENU_ITEM_DANGER_CLASS}>
                  {t("editMode.deleteFile")}
                </ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {!isCollapsed && node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            dirtyPath={dirtyPath}
            collapsed={collapsed}
            inlineEdit={inlineEdit}
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
            onDeleteDir={onDeleteDir}
            onReveal={onReveal}
            onStartNewFile={onStartNewFile}
            onStartNewDir={onStartNewDir}
            onStartRename={onStartRename}
            onCommitInline={onCommitInline}
            onCancelInline={onCancelInline}
          />
        ))}
        {showChildInline && (
          <InlineInput
            depth={depth + 1}
            defaultValue={inlineEdit.mode === "new-file" ? ".md" : ""}
            selectRange={inlineEdit.mode === "new-file" ? [0, 0] : undefined}
            icon={inlineEdit.mode === "new-file" ? "file" : "folder"}
            onCommit={onCommitInline}
            onCancel={onCancelInline}
          />
        )}
      </>
    );
  }

  // File item
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
            <ContextMenu.Item onClick={() => onStartRename(node.path, node.name)} className={MENU_ITEM_CLASS}>
              {t("editMode.rename")}
            </ContextMenu.Item>
            <ContextMenu.Item
              onClick={() => onReveal(node.path)}
              className={MENU_ITEM_CLASS}
            >
              {t("editMode.revealInExplorer")}
            </ContextMenu.Item>
            <div className={MENU_SEPARATOR_CLASS} />
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
