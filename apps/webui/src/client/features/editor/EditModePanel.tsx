import { useState, useRef } from "react";
import { FileTree } from "./FileTree.js";
import { FileEditor } from "./FileEditor.js";
import { UnsavedDialog } from "./UnsavedDialog.js";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog.js";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle.js";
import type { EditorAPI } from "@/client/entities/editor/index.js";
import { useEditMode } from "./useEditMode.js";

const DEFAULT_TREE_WIDTH = 200;
const MIN_TREE_WIDTH = 140;
const MAX_TREE_WIDTH = 400;

export function EditModePanel() {
  const editorApiRef = useRef<EditorAPI | null>(null);
  const {
    treeEntries,
    selectedPath,
    baseline,
    dirty,
    selectFile,
    saveCurrentFile,
    markDirty,
    unsavedDialogOpen,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
    deleteConfirmPath,
    requestDeleteFile,
    confirmDeleteFile,
    cancelDeleteFile,
    revealFile,
    deleteConfirmDir,
    requestDeleteDir,
    confirmDeleteDir,
    cancelDeleteDir,
    renameEntry,
    createFileInDir,
    createDirInDir,
  } = useEditMode(editorApiRef);

  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
  const dragStartRef = useRef(0);

  const handleTreeResize = (delta: number) => {
    setTreeWidth(Math.max(MIN_TREE_WIDTH, Math.min(MAX_TREE_WIDTH, dragStartRef.current + delta)));
  };

  return (
    <>
      {/* Tree panel */}
      <div
        style={{ width: treeWidth }}
        className="flex-shrink-0 border-r border-edge/6 bg-base/40 transition-colors duration-300"
      >
        <FileTree
          entries={treeEntries}
          selectedPath={selectedPath}
          dirty={dirty}
          onSelect={selectFile}
          onDelete={requestDeleteFile}
          onDeleteDir={requestDeleteDir}
          onReveal={revealFile}
          onRename={renameEntry}
          onCreateFile={createFileInDir}
          onCreateDir={createDirInDir}
        />
      </div>

      {/* Tree resize handle */}
      <ResizeHandle
        onResizeStart={() => { dragStartRef.current = treeWidth; }}
        onResize={handleTreeResize}
      />

      {/* Editor panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface/30 transition-colors duration-300">
        <FileEditor
          editorRef={editorApiRef}
          path={selectedPath}
          baseline={baseline}
          dirty={dirty}
          onMarkDirty={markDirty}
          onSave={saveCurrentFile}
        />
      </div>

      {/* Unsaved changes dialog */}
      <UnsavedDialog
        open={unsavedDialogOpen}
        onSave={() => void handleUnsavedSave()}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />

      {/* File delete confirmation dialog */}
      <DeleteConfirmDialog
        path={deleteConfirmPath}
        type="file"
        onConfirm={() => void confirmDeleteFile()}
        onCancel={cancelDeleteFile}
      />

      {/* Folder delete confirmation dialog */}
      <DeleteConfirmDialog
        path={deleteConfirmDir}
        type="dir"
        onConfirm={() => void confirmDeleteDir()}
        onCancel={cancelDeleteDir}
      />
    </>
  );
}
