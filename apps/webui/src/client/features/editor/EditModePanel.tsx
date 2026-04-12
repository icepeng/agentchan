import { useState, useCallback, useRef, useEffect } from "react";
import { FileTree } from "./FileTree.js";
import { FileEditor } from "./FileEditor.js";
import { UnsavedDialog } from "./UnsavedDialog.js";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle.js";
import { useEditMode } from "./useEditMode.js";

const DEFAULT_TREE_WIDTH = 200;
const MIN_TREE_WIDTH = 140;
const MAX_TREE_WIDTH = 400;

export function EditModePanel() {
  const {
    treeEntries,
    selectedPath,
    fileContent,
    dirty,
    selectFile,
    saveCurrentFile,
    handleDocChange,
    unsavedDialogOpen,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  } = useEditMode();

  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
  const treeWidthRef = useRef(DEFAULT_TREE_WIDTH);
  useEffect(() => { treeWidthRef.current = treeWidth; }, [treeWidth]);

  const handleTreeResize = useCallback((delta: number) => {
    setTreeWidth(Math.max(MIN_TREE_WIDTH, Math.min(MAX_TREE_WIDTH, treeWidthRef.current + delta)));
  }, []);

  return (
    <>
      {/* Tree panel */}
      <div
        style={{ width: treeWidth }}
        className="flex-shrink-0 border-r border-edge/6 bg-base/40"
      >
        <FileTree
          entries={treeEntries}
          selectedPath={selectedPath}
          dirty={dirty}
          onSelect={selectFile}
        />
      </div>

      {/* Tree resize handle */}
      <ResizeHandle onResize={handleTreeResize} />

      {/* Editor panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface/30">
        <FileEditor
          path={selectedPath}
          content={fileContent}
          dirty={dirty}
          onDocChange={handleDocChange}
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
    </>
  );
}
