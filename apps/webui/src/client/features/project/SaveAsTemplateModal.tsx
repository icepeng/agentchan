import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
  Check,
  Minus,
} from "lucide-react";
import { Dialog, Button, TextInput, FormField } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { fetchProjectTree, readProjectFile, isImagePath, buildTree, FileIcon, type TreeEntry, type TreeNode } from "@/client/entities/editor/index.js";
import { saveProjectAsTemplate } from "@/client/entities/template/index.js";
import { BASE } from "@/client/shared/api.js";

function collectFilePaths(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  return node.children.flatMap(collectFilePaths);
}

/** Pre-compute file paths for each directory node to avoid re-traversal on every render. */
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

// -- Checkbox tree item --

interface CheckboxTreeItemProps {
  node: TreeNode;
  depth: number;
  excluded: Set<string>;
  collapsed: Set<string>;
  selectedPreview: string | null;
  filePathsMap: Map<string, string[]>;
  onToggleExclude: (node: TreeNode) => void;
  onToggleCollapse: (path: string) => void;
  onSelectPreview: (path: string) => void;
}

function CheckboxTreeItem({
  node, depth, excluded, collapsed, selectedPreview, filePathsMap,
  onToggleExclude, onToggleCollapse, onSelectPreview,
}: CheckboxTreeItemProps) {
  const isDir = node.type === "dir";
  const isCollapsed = collapsed.has(node.path);

  if (isDir) {
    const allFiles = filePathsMap.get(node.path) ?? [];
    const excludedCount = allFiles.filter((p) => excluded.has(p)).length;
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
            onClick={() => onToggleExclude(node)}
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
            onToggleExclude={onToggleExclude}
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
        onClick={(e) => { e.stopPropagation(); onToggleExclude(node); }}
        className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
          !isExcluded
            ? "bg-accent border-accent text-void"
            : "border-fg-4 hover:border-fg-3"
        }`}
      >
        {!isExcluded && <Check size={10} strokeWidth={3} />}
      </button>
      <FileIcon name={node.name} />
      <span className={`truncate text-[12px] ${isExcluded ? "line-through opacity-50" : ""}`}>{node.name}</span>
    </div>
  );
}

// -- Preview panel --

interface PreviewPanelProps {
  slug: string;
  selectedPath: string | null;
}

function PreviewPanel({ slug, selectedPath }: PreviewPanelProps) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- 선택 변경 시 이전 콘텐츠 정리
    if (!selectedPath) { setContent(null); return; }
    if (isImagePath(selectedPath)) { setContent(null); return; }

    let cancelled = false;
    setLoading(true);
    readProjectFile(slug, `files/${selectedPath}`)
      .then((res) => { if (!cancelled) setContent(res.content); })
      .catch(() => { if (!cancelled) setContent(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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

// -- Main modal --

interface SaveAsTemplateModalProps {
  slug: string | null;
  onClose: () => void;
}

export function SaveAsTemplateModal({ slug, onClose }: SaveAsTemplateModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fileEntries, setFileEntries] = useState<TreeEntry[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [overwritePrompt, setOverwritePrompt] = useState(false);

  // Load file tree when slug changes
  useEffect(() => {
    if (!slug) return;
    // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- slug 변경 시 폼 리셋 (Dialog는 항상 마운트 상태)
    setName("");
    setDescription("");
    setFileEntries([]);
    setExcluded(new Set());
    setCollapsed(new Set());
    setSelectedPreview(null);
    setSaving(false);
    setNameError(false);
    setOverwritePrompt(false);

    void fetchProjectTree(slug).then(({ entries }) => {
      // Filter to files/ prefix only, then strip the prefix
      const filesEntries = entries
        .filter((e) => e.path.startsWith("files/"))
        .map((e) => ({ ...e, path: e.path.slice("files/".length) }));
      setFileEntries(filesEntries);
    });
  }, [slug]);

  const tree = buildTree(fileEntries);
  const filePathsMap = buildFilePathsMap(tree);
  const hasFiles = fileEntries.length > 0;

  const toggleExclude = (node: TreeNode) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      const paths = collectFilePaths(node);
      const allExcluded = paths.every((p) => next.has(p));
      if (allExcluded) {
        for (const p of paths) next.delete(p);
      } else {
        for (const p of paths) next.add(p);
      }
      return next;
    });
  };

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const doSave = async (overwrite: boolean) => {
    if (!slug) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    setSaving(true);
    try {
      const result = await saveProjectAsTemplate(slug, {
        name: trimmedName,
        description: description.trim() || undefined,
        excludeFiles: [...excluded],
        overwrite,
      });

      if (result.conflict) {
        setOverwritePrompt(true);
        setSaving(false);
        return;
      }

      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Dialog open={slug !== null} onOpenChange={(open) => { if (!open) onClose(); }} size={hasFiles ? "xl" : "md"}>
      <div className="p-6 space-y-5">
        {/* Title */}
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">
          {t("template.saveTitle")}
        </h2>

        {/* Name + Description */}
        <div className="space-y-3">
          <FormField label={t("template.name")}>
            <TextInput
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(false); setOverwritePrompt(false); }}
              placeholder={t("template.namePlaceholder")}
              className={nameError ? "!border-danger/60" : ""}
              autoFocus
            />
          </FormField>
          <FormField label={t("template.templateDescription")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("template.descriptionPlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-edge/8 bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-4 outline-none focus:border-accent/30 resize-none"
            />
          </FormField>
        </div>

        {/* File tree + preview */}
        {hasFiles && (
          <div className="border border-edge/8 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-elevated/50 border-b border-edge/8">
              <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
                {t("template.files")}
              </span>
            </div>
            <div className="flex" style={{ height: "280px" }}>
              {/* Left: tree with checkboxes */}
              <div className="w-1/2 border-r border-edge/8 overflow-y-auto overflow-x-hidden py-1 select-none">
                {tree.map((node) => (
                  <CheckboxTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    excluded={excluded}
                    collapsed={collapsed}
                    selectedPreview={selectedPreview}
                    filePathsMap={filePathsMap}
                    onToggleExclude={toggleExclude}
                    onToggleCollapse={toggleCollapse}
                    onSelectPreview={setSelectedPreview}
                  />
                ))}
              </div>
              {/* Right: preview */}
              <div className="w-1/2 overflow-hidden">
                <PreviewPanel slug={slug!} selectedPath={selectedPreview} />
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          {overwritePrompt ? (
            <>
              <span className="text-sm text-fg-3 mr-auto">
                {t("template.overwriteConfirm", { name: name.trim() })}
              </span>
              <Button variant="ghost" onClick={() => setOverwritePrompt(false)}>
                {t("editMode.cancel")}
              </Button>
              <Button variant="danger" onClick={() => doSave(true)} disabled={saving}>
                {t("template.overwrite")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t("editMode.cancel")}
              </Button>
              <Button variant="accent" onClick={() => doSave(false)} disabled={saving}>
                {saving ? t("template.saving") : t("template.save")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
