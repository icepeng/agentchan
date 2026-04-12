import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import { useSessionState } from "@/client/entities/session/index.js";
import { useUIState } from "@/client/entities/ui/index.js";
import {
  useEditorState,
  useEditorDispatch,
  fetchProjectTree,
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
} from "@/client/entities/editor/index.js";

export function useEditMode() {
  const ui = useUIState();
  const project = useProjectState();
  const session = useSessionState();
  const editor = useEditorState();
  const editorDispatch = useEditorDispatch();

  const slug = project.activeProjectSlug;
  const isEdit = ui.viewMode === "edit";
  const wasStreaming = useRef(false);
  const selectedPathRef = useRef(editor.selectedPath);
  const dirtyRef = useRef(editor.dirty);

  useEffect(() => { selectedPathRef.current = editor.selectedPath; }, [editor.selectedPath]);
  useEffect(() => { dirtyRef.current = editor.dirty; }, [editor.dirty]);

  // Pending navigation while unsaved dialog is shown
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Pending delete confirmation
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);

  // Fetch tree when entering edit mode or switching project
  useEffect(() => {
    if (!isEdit || !slug) return;
    void fetchProjectTree(slug).then(({ entries }) => {
      editorDispatch({ type: "SET_TREE", entries });
    });
  }, [isEdit, slug, editorDispatch]);

  // Refetch tree when agent streaming completes
  useEffect(() => {
    if (session.isStreaming) {
      wasStreaming.current = true;
    } else if (wasStreaming.current) {
      wasStreaming.current = false;
      if (isEdit && slug) {
        void fetchProjectTree(slug).then(({ entries }) => {
          editorDispatch({ type: "SET_TREE", entries });
        });
        // Reload current file if clean (agent may have modified it)
        if (selectedPathRef.current && !dirtyRef.current) {
          void readProjectFile(slug, selectedPathRef.current).then(({ content }) => {
            editorDispatch({ type: "SYNC_EXTERNAL_CONTENT", content });
          });
        }
      }
    }
  }, [session.isStreaming, isEdit, slug, editorDispatch]);

  // Clear editor on project switch
  useEffect(() => {
    editorDispatch({ type: "CLEAR" });
  }, [slug, editorDispatch]);

  const loadFile = useCallback(async (path: string) => {
    if (!slug) return;
    const { content } = await readProjectFile(slug, path);
    editorDispatch({ type: "SELECT_FILE", path, content });
  }, [slug, editorDispatch]);

  const selectFile = useCallback((path: string) => {
    if (path === editor.selectedPath) return;
    if (editor.dirty) {
      setPendingPath(path);
      return;
    }
    void loadFile(path);
  }, [editor.selectedPath, editor.dirty, loadFile]);

  const saveCurrentFile = useCallback(async () => {
    if (!slug || !editor.selectedPath || editor.localContent === null) return;
    await writeProjectFile(slug, editor.selectedPath, editor.localContent);
    editorDispatch({ type: "MARK_CLEAN" });
  }, [slug, editor.selectedPath, editor.localContent, editorDispatch]);

  const handleDocChange = useCallback((content: string) => {
    editorDispatch({ type: "UPDATE_LOCAL_CONTENT", content });
  }, [editorDispatch]);

  // Unsaved dialog handlers
  const handleUnsavedSave = useCallback(async () => {
    await saveCurrentFile();
    if (pendingPath) {
      void loadFile(pendingPath);
      setPendingPath(null);
    }
  }, [saveCurrentFile, pendingPath, loadFile]);

  const handleUnsavedDiscard = useCallback(() => {
    if (pendingPath) {
      void loadFile(pendingPath);
      setPendingPath(null);
    }
  }, [pendingPath, loadFile]);

  const handleUnsavedCancel = useCallback(() => {
    setPendingPath(null);
  }, []);

  // Delete flow
  const requestDeleteFile = useCallback((path: string) => {
    setDeleteConfirmPath(path);
  }, []);

  const confirmDeleteFile = useCallback(async () => {
    if (!slug || !deleteConfirmPath) return;
    try {
      await deleteProjectFile(slug, deleteConfirmPath);
      if (selectedPathRef.current === deleteConfirmPath) {
        editorDispatch({ type: "DESELECT_FILE" });
      }
      const { entries } = await fetchProjectTree(slug);
      editorDispatch({ type: "SET_TREE", entries });
    } finally {
      setDeleteConfirmPath(null);
    }
  }, [slug, deleteConfirmPath, editorDispatch]);

  const cancelDeleteFile = useCallback(() => {
    setDeleteConfirmPath(null);
  }, []);

  return {
    treeEntries: editor.treeEntries,
    selectedPath: editor.selectedPath,
    fileContent: editor.localContent,
    dirty: editor.dirty,
    selectFile,
    saveCurrentFile,
    handleDocChange,
    // Unsaved dialog
    unsavedDialogOpen: pendingPath !== null,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
    // Delete dialog
    deleteConfirmPath,
    requestDeleteFile,
    confirmDeleteFile,
    cancelDeleteFile,
  };
}
