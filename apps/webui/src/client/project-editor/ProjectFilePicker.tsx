import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Minus,
} from "lucide-react";
import { BASE, useI18n } from "@/client/platform/index.js";
import { fetchProjectTree, readProjectFile } from "./editor.api.js";
import { isImagePath, type TreeEntry } from "./editor.types.js";
import { buildTree, FileIcon, type TreeNode } from "./file-tree.utils.js";

interface ProjectFilePickerProps {
  slug: string;
  excludedFiles: ReadonlySet<string>;
  previewSelected: string | null;
  onToggle: (paths: string[]) => void;
  onSelectPreview: (path: string) => void;
}

export function ProjectFilePicker({
  slug,
  excludedFiles,
  previewSelected,
  onToggle,
  onSelectPreview,
}: ProjectFilePickerProps) {
  const { t } = useI18n();
  const [fileEntries, setFileEntries] = useState<TreeEntry[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- slug 변경 시 이전 Project file tree를 즉시 비운다.
    setFileEntries([]);
    setCollapsed(new Set());

    let cancelled = false;
    void fetchProjectTree(slug).then(({ entries }) => {
      if (cancelled) return;
      const filesEntries = entries
        .filter((entry) => entry.path.startsWith("files/"))
        .map((entry) => ({ ...entry, path: entry.path.slice("files/".length) }));
      setFileEntries(filesEntries);
    });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (fileEntries.length === 0) return null;

  const tree = buildTree(fileEntries);
  const filePathsMap = buildFilePathsMap(tree);

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="border border-edge/8 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-elevated/50 border-b border-edge/8">
        <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
          {t("template.files")}
        </span>
      </div>
      <div className="flex" style={{ height: "280px" }}>
        <div className="w-1/2 border-r border-edge/8 overflow-y-auto overflow-x-hidden py-1 select-none">
          {tree.map((node) => (
            <CheckboxTreeItem
              key={node.path}
              node={node}
              depth={0}
              excluded={excludedFiles}
              collapsed={collapsed}
              selectedPreview={previewSelected}
              filePathsMap={filePathsMap}
              onToggle={onToggle}
              onToggleCollapse={toggleCollapse}
              onSelectPreview={onSelectPreview}
            />
          ))}
        </div>
        <div className="w-1/2 overflow-hidden">
          <PreviewPanel slug={slug} selectedPath={previewSelected} />
        </div>
      </div>
    </div>
  );
}

function collectFilePaths(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  return node.children.flatMap(collectFilePaths);
}

function buildFilePathsMap(roots: TreeNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  function walk(node: TreeNode) {
    if (node.type === "dir") {
      map.set(node.path, collectFilePaths(node));
      node.children.forEach(walk);
    }
  }
  roots.forEach(walk);
  return map;
}

interface CheckboxTreeItemProps {
  node: TreeNode;
  depth: number;
  excluded: ReadonlySet<string>;
  collapsed: Set<string>;
  selectedPreview: string | null;
  filePathsMap: Map<string, string[]>;
  onToggle: (paths: string[]) => void;
  onToggleCollapse: (path: string) => void;
  onSelectPreview: (path: string) => void;
}

function CheckboxTreeItem({
  node,
  depth,
  excluded,
  collapsed,
  selectedPreview,
  filePathsMap,
  onToggle,
  onToggleCollapse,
  onSelectPreview,
}: CheckboxTreeItemProps) {
  const isDir = node.type === "dir";
  const isCollapsed = collapsed.has(node.path);

  if (isDir) {
    const allFiles = filePathsMap.get(node.path) ?? [];
    const excludedCount = allFiles.filter((path) => excluded.has(path)).length;
    const checkState: "all" | "some" | "none" =
      excludedCount === 0 ? "all" : excludedCount === allFiles.length ? "none" : "some";
    const FolderIcon = isCollapsed ? FolderClosed : FolderOpen;
    const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <>
        <div
          className="flex items-center gap-1 px-2 py-1 hover:bg-accent/8 text-fg-2 hover:text-fg transition-colors rounded-md cursor-pointer"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => onToggle(allFiles)}
            className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
              checkState === "all"
                ? "bg-accent border-accent text-void"
                : checkState === "some"
                  ? "bg-accent/40 border-accent/60 text-void"
                  : "border-fg-4 hover:border-fg-3"
            }`}
          >
            {checkState === "all" && <Check size={10} strokeWidth={3} />}
            {checkState === "some" && <Minus size={10} strokeWidth={3} />}
          </button>
          <button
            type="button"
            onClick={() => onToggleCollapse(node.path)}
            className="flex items-center gap-1 flex-1 min-w-0"
          >
            <ChevronIcon size={12} strokeWidth={2} className="text-fg-4 flex-shrink-0" />
            <FolderIcon size={13} strokeWidth={2} className="text-accent/60 flex-shrink-0" />
            <span className="truncate ml-0.5 text-[12px]">{node.name}</span>
          </button>
        </div>
        {!isCollapsed && node.children.map((child) => (
          <CheckboxTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            excluded={excluded}
            collapsed={collapsed}
            selectedPreview={selectedPreview}
            filePathsMap={filePathsMap}
            onToggle={onToggle}
            onToggleCollapse={onToggleCollapse}
            onSelectPreview={onSelectPreview}
          />
        ))}
      </>
    );
  }

  const isExcluded = excluded.has(node.path);
  const isSelected = node.path === selectedPreview;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-pointer ${
        isSelected ? "bg-accent/12 text-accent" : "text-fg-2 hover:bg-accent/6 hover:text-fg"
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => onSelectPreview(node.path)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle([node.path]);
        }}
        className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
          !isExcluded
            ? "bg-accent border-accent text-void"
            : "border-fg-4 hover:border-fg-3"
        }`}
      >
        {!isExcluded && <Check size={10} strokeWidth={3} />}
      </button>
      <FileIcon name={node.name} />
      <span className={`truncate text-[12px] ${isExcluded ? "line-through opacity-50" : ""}`}>
        {node.name}
      </span>
    </div>
  );
}

function PreviewPanel({ slug, selectedPath }: { slug: string; selectedPath: string | null }) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPath) {
      // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- preview 선택 해제에 맞춰 이전 텍스트 preview를 지운다.
      setContent(null);
      return;
    }
    if (isImagePath(selectedPath)) {
      // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- 이미지 preview는 텍스트 content를 사용하지 않는다.
      setContent(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    readProjectFile(slug, `files/${selectedPath}`)
      .then((res) => {
        if (!cancelled) setContent(res.content);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, selectedPath]);

  if (!selectedPath) {
    return (
      <div className="flex items-center justify-center h-full text-fg-4 text-sm">
        {t("template.noPreview")}
      </div>
    );
  }

  if (isImagePath(selectedPath)) {
    return (
      <div className="flex items-center justify-center h-full p-4 overflow-auto">
        <img
          src={`${BASE}/projects/${encodeURIComponent(slug)}/files/${selectedPath}`}
          alt={selectedPath}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-fg-4 text-sm">
        {t("settings.loading")}
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex items-center justify-center h-full text-fg-4 text-sm">
        {t("template.binaryFile")}
      </div>
    );
  }

  return (
    <pre className="h-full overflow-auto p-3 text-[11px] text-fg-3 font-mono whitespace-pre-wrap break-words leading-relaxed">
      {content}
    </pre>
  );
}
