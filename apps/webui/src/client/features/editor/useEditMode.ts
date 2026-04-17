import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useProjectState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/project-runtime/index.js";
import { useUIState } from "@/client/entities/ui/index.js";
import {
  useEditorState,
  useEditorDispatch,
  useProjectTree,
  useFileContent,
  useEditorMutations,
} from "@/client/entities/editor/index.js";
import { qk } from "@/client/shared/queryKeys.js";

export function useEditMode() {
  const ui = useUIState();
  const project = useProjectState();
  const stream = useActiveStream();
  const editor = useEditorState();
  const editorDispatch = useEditorDispatch();
  const { mutate } = useSWRConfig();

  const slug = project.activeProjectSlug;
  const isEdit = ui.viewMode === "edit";

  // Tree only loads while the editor is open — no point pulling on every
  // project switch when the user is just chatting.
  const { data: treeData } = useProjectTree(isEdit ? slug : null);
  const treeEntries = treeData?.entries ?? [];

  // File content for the active selection. SWR keys by [slug, path] so
  // switching files is a free cache hit when one's been opened before.
  const { data: fileData } = useFileContent(slug, editor.selectedPath);

  const {
    write,
    removeFile: deleteFile,
    removeDir: deleteDir,
    rename,
    createDir,
    reveal,
  } = useEditorMutations(slug);

  // Refs so the streaming-finished effect doesn't have to re-subscribe to
  // selectedPath/dirty churn.
  const wasStreaming = useRef(false);
  const selectedPathRef = useRef(editor.selectedPath);
  const dirtyRef = useRef(editor.dirty);
  useEffect(() => { selectedPathRef.current = editor.selectedPath; }, [editor.selectedPath]);
  useEffect(() => { dirtyRef.current = editor.dirty; }, [editor.dirty]);

  // Pending navigation while unsaved dialog is shown
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Pending delete confirmation
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [deleteConfirmDir, setDeleteConfirmDir] = useState<string | null>(null);

  // Sync localContent ← server content. Skip when:
  //  - no data yet
  //  - user has unsaved edits (preserve buffer)
  //  - already in sync (avoids the SYNC→dirty=false→re-render→re-SYNC loop)
  useEffect(() => {
    if (!fileData) return;
    if (editor.dirty) return;
    if (editor.localContent === fileData.content) return;
    editorDispatch({ type: "SYNC_EXTERNAL_CONTENT", content: fileData.content });
  }, [fileData, editor.dirty, editor.localContent, editorDispatch]);

  // Refetch tree + active file when an agent stream finishes (it may have
  // edited files behind our back).
  useEffect(() => {
    if (stream.isStreaming) {
      wasStreaming.current = true;
      return;
    }
    if (!wasStreaming.current) return;
    wasStreaming.current = false;
    if (!isEdit || !slug) return;
    void mutate(qk.projectTree(slug));
    if (selectedPathRef.current && !dirtyRef.current) {
      void mutate(qk.projectFile(slug, selectedPathRef.current));
    }
  }, [stream.isStreaming, isEdit, slug, mutate]);

  // Clear editor on project switch (don't carry stale selection across projects).
  useEffect(() => {
    editorDispatch({ type: "CLEAR" });
  }, [slug, editorDispatch]);

  const selectFile = useCallback((path: string) => {
    if (path === editor.selectedPath) return;
    if (editor.dirty) {
      setPendingPath(path);
      return;
    }
    editorDispatch({ type: "SELECT_FILE", path });
  }, [editor.selectedPath, editor.dirty, editorDispatch]);

  const saveCurrentFile = useCallback(async () => {
    if (!slug || !editor.selectedPath || editor.localContent === null) return;
    await write(editor.selectedPath, editor.localContent);
    editorDispatch({ type: "MARK_CLEAN" });
  }, [slug, editor.selectedPath, editor.localContent, write, editorDispatch]);

  const handleDocChange = useCallback((content: string) => {
    editorDispatch({ type: "UPDATE_LOCAL_CONTENT", content });
  }, [editorDispatch]);

  // Unsaved dialog handlers
  const handleUnsavedSave = useCallback(async () => {
    await saveCurrentFile();
    if (pendingPath) {
      editorDispatch({ type: "SELECT_FILE", path: pendingPath });
      setPendingPath(null);
    }
  }, [saveCurrentFile, pendingPath, editorDispatch]);

  const handleUnsavedDiscard = useCallback(() => {
    if (pendingPath) {
      editorDispatch({ type: "SELECT_FILE", path: pendingPath });
      setPendingPath(null);
    }
  }, [pendingPath, editorDispatch]);

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
      await deleteFile(deleteConfirmPath);
      if (selectedPathRef.current === deleteConfirmPath) {
        editorDispatch({ type: "DESELECT_FILE" });
      }
    } finally {
      setDeleteConfirmPath(null);
    }
  }, [slug, deleteConfirmPath, deleteFile, editorDispatch]);

  const cancelDeleteFile = useCallback(() => {
    setDeleteConfirmPath(null);
  }, []);

  // Folder delete flow
  const requestDeleteDir = useCallback((path: string) => {
    setDeleteConfirmDir(path);
  }, []);

  const confirmDeleteDir = useCallback(async () => {
    if (!slug || !deleteConfirmDir) return;
    try {
      await deleteDir(deleteConfirmDir);
      if (selectedPathRef.current && (
        selectedPathRef.current === deleteConfirmDir ||
        selectedPathRef.current.startsWith(deleteConfirmDir + "/")
      )) {
        editorDispatch({ type: "DESELECT_FILE" });
      }
    } finally {
      setDeleteConfirmDir(null);
    }
  }, [slug, deleteConfirmDir, deleteDir, editorDispatch]);

  const cancelDeleteDir = useCallback(() => {
    setDeleteConfirmDir(null);
  }, []);

  // Rename
  const renameEntry = useCallback(async (oldPath: string, newName: string) => {
    if (!slug) return;
    const parentPath = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : null;
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    await rename(oldPath, newPath);

    // Update selectedPath if the renamed item is the open file or a parent folder.
    const selected = selectedPathRef.current;
    if (selected) {
      if (selected === oldPath) {
        editorDispatch({ type: "RENAME_SELECTED", newPath });
      } else if (selected.startsWith(oldPath + "/")) {
        editorDispatch({ type: "RENAME_SELECTED", newPath: newPath + selected.slice(oldPath.length) });
      }
    }
  }, [slug, rename, editorDispatch]);

  // Create file / dir
  const createFileInDir = useCallback(async (dirPath: string | null, fileName: string) => {
    if (!slug) return;
    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
    await write(filePath, "");
    editorDispatch({ type: "SELECT_FILE", path: filePath });
  }, [slug, write, editorDispatch]);

  const createDirInDir = useCallback(async (parentPath: string | null, dirName: string) => {
    if (!slug) return;
    const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName;
    await createDir(dirPath);
  }, [slug, createDir]);

  const revealFile = useCallback((path: string) => {
    if (!slug) return;
    void reveal(path);
  }, [slug, reveal]);

  return {
    treeEntries,
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
    // Reveal in explorer
    revealFile,
    // Folder delete dialog
    deleteConfirmDir,
    requestDeleteDir,
    confirmDeleteDir,
    cancelDeleteDir,
    // Rename
    renameEntry,
    // Create
    createFileInDir,
    createDirInDir,
  };
}
