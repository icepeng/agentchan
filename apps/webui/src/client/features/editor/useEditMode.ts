import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/stream/index.js";
import { useUIState } from "@/client/entities/ui/index.js";
import {
  useEditorState,
  useEditorDispatch,
  useProjectTree,
  useFileContent,
  useEditorMutations,
} from "@/client/entities/editor/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useLatestRef } from "@/client/shared/useLatestRef.js";

export function useEditMode() {
  const ui = useUIState();
  const project = useProjectSelectionState();
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

  // Derived: SWR cache is ground truth. A buffer only exists while editing.
  // dirty is parity against the server baseline — never stored, so it can't
  // drift against the SWR cache.
  const serverContent = fileData?.content;
  const dirty =
    editor.buffer !== null && serverContent !== undefined && editor.buffer !== serverContent;
  const fileContent = editor.buffer ?? serverContent ?? null;

  // Refs so the streaming-finished effect and async delete/rename handlers see
  // latest selectedPath/dirty without re-subscribing or stale-closure risk.
  const wasStreaming = useRef(false);
  const selectedPathRef = useLatestRef(editor.selectedPath);
  const dirtyRef = useLatestRef(dirty);

  // Pending navigation while unsaved dialog is shown
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Pending delete confirmation
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [deleteConfirmDir, setDeleteConfirmDir] = useState<string | null>(null);

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
  }, [stream.isStreaming, isEdit, slug, mutate, selectedPathRef, dirtyRef]);

  // Clear editor on project switch (don't carry stale selection across projects).
  useEffect(() => {
    editorDispatch({ type: "CLEAR" });
  }, [slug, editorDispatch]);

  const selectFile = (path: string) => {
    if (path === editor.selectedPath) return;
    if (dirty) {
      setPendingPath(path);
      return;
    }
    editorDispatch({ type: "SELECT_FILE", path });
  };

  const saveCurrentFile = async () => {
    if (!slug || !editor.selectedPath || editor.buffer === null) return;
    const saved = editor.buffer;
    await write(editor.selectedPath, saved);
    // Conditional drop: if the user typed more during the await, keep their
    // buffer — dirty will re-derive against the new serverContent.
    editorDispatch({ type: "DISCARD_BUFFER", ifEquals: saved });
  };

  const handleDocChange = (content: string) => {
    editorDispatch({ type: "UPDATE_BUFFER", content });
  };

  // Unsaved dialog handlers
  const handleUnsavedSave = async () => {
    await saveCurrentFile();
    if (pendingPath) {
      editorDispatch({ type: "SELECT_FILE", path: pendingPath });
      setPendingPath(null);
    }
  };

  const handleUnsavedDiscard = () => {
    if (pendingPath) {
      editorDispatch({ type: "SELECT_FILE", path: pendingPath });
      setPendingPath(null);
    }
  };

  const handleUnsavedCancel = () => {
    setPendingPath(null);
  };

  // Delete flow
  const requestDeleteFile = (path: string) => {
    setDeleteConfirmPath(path);
  };

  const confirmDeleteFile = async () => {
    if (!slug || !deleteConfirmPath) return;
    try {
      await deleteFile(deleteConfirmPath);
      if (selectedPathRef.current === deleteConfirmPath) {
        editorDispatch({ type: "DESELECT_FILE" });
      }
    } finally {
      setDeleteConfirmPath(null);
    }
  };

  const cancelDeleteFile = () => {
    setDeleteConfirmPath(null);
  };

  // Folder delete flow
  const requestDeleteDir = (path: string) => {
    setDeleteConfirmDir(path);
  };

  const confirmDeleteDir = async () => {
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
  };

  const cancelDeleteDir = () => {
    setDeleteConfirmDir(null);
  };

  // Rename
  const renameEntry = async (oldPath: string, newName: string) => {
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
  };

  // Create file / dir
  const createFileInDir = async (dirPath: string | null, fileName: string) => {
    if (!slug) return;
    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
    await write(filePath, "");
    editorDispatch({ type: "SELECT_FILE", path: filePath });
  };

  const createDirInDir = async (parentPath: string | null, dirName: string) => {
    if (!slug) return;
    const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName;
    await createDir(dirPath);
  };

  const revealFile = (path: string) => {
    if (!slug) return;
    void reveal(path);
  };

  return {
    treeEntries,
    selectedPath: editor.selectedPath,
    fileContent,
    dirty,
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
