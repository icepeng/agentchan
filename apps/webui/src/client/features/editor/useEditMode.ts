import { useEffect, useRef, useState, type RefObject } from "react";
import { useSWRConfig } from "swr";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/stream/index.js";
import { useUIState } from "@/client/entities/ui/index.js";
import {
  useEditorState,
  useEditorDispatch,
  useProjectTree,
  useEditorMutations,
  readProjectFile,
  type EditorAPI,
} from "@/client/entities/editor/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useLatestRef } from "@/client/shared/useLatestRef.js";

export function useEditMode(editorApiRef: RefObject<EditorAPI | null>) {
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

  const {
    write,
    removeFile: deleteFile,
    removeDir: deleteDir,
    rename,
    createDir,
    reveal,
  } = useEditorMutations(slug);

  const dirty = editor.dirty;
  const baseline = editor.originalContent;

  const wasStreaming = useRef(false);
  const selectedPathRef = useLatestRef(editor.selectedPath);
  const dirtyRef = useLatestRef(dirty);

  // Last-write-wins: if a newer selection supersedes an in-flight fetch,
  // drop the stale payload rather than flashing old content into the new slot.
  const pendingSelectionRef = useRef<string | null>(null);

  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [deleteConfirmDir, setDeleteConfirmDir] = useState<string | null>(null);

  // Refetch tree + active file when an agent stream finishes — it may have
  // edited files behind our back.
  useEffect(() => {
    if (stream.isStreaming) {
      wasStreaming.current = true;
      return;
    }
    if (!wasStreaming.current) return;
    wasStreaming.current = false;
    if (!isEdit || !slug) return;
    void mutate(qk.projectTree(slug));
    const path = selectedPathRef.current;
    if (!path || dirtyRef.current) return;
    void (async () => {
      const { content } = await readProjectFile(slug, path);
      editorDispatch({ type: "EXTERNAL_REFRESH", path, content });
    })();
  }, [stream.isStreaming, isEdit, slug, mutate, selectedPathRef, dirtyRef, editorDispatch]);

  useEffect(() => {
    // Cross-project contamination guard: an in-flight fetch from the
    // previous project would otherwise dispatch SELECT_FILE into the new
    // project's state if its path happens to match the guard lane.
    pendingSelectionRef.current = null;
    editorDispatch({ type: "CLEAR" });
  }, [slug, editorDispatch]);

  const fetchAndSelect = async (path: string) => {
    if (!slug) return;
    pendingSelectionRef.current = path;
    const { content } = await readProjectFile(slug, path);
    if (pendingSelectionRef.current !== path) return;
    editorDispatch({ type: "SELECT_FILE", path, content });
  };

  const selectFile = (path: string) => {
    if (path === editor.selectedPath) return;
    if (dirty) {
      setPendingPath(path);
      return;
    }
    void fetchAndSelect(path);
  };

  const saveCurrentFile = async () => {
    if (!slug || !editor.selectedPath) return;
    const saved = editorApiRef.current?.getContent();
    if (saved == null) return;
    await write(editor.selectedPath, saved);
    editorDispatch({ type: "FILE_SAVED", savedContent: saved });
    // If the user kept typing during the write round-trip, FILE_SAVED's
    // dirty-clear would falsely signal "clean"; re-mark so the indicator
    // reflects the un-persisted edits.
    const current = editorApiRef.current?.getContent();
    if (current != null && current !== saved) {
      editorDispatch({ type: "MARK_DIRTY" });
    }
  };

  const markDirty = () => {
    editorDispatch({ type: "MARK_DIRTY" });
  };

  const navigatePending = async () => {
    if (!pendingPath) return;
    const target = pendingPath;
    setPendingPath(null);
    await fetchAndSelect(target);
  };

  const handleUnsavedSave = async () => {
    await saveCurrentFile();
    await navigatePending();
  };

  const handleUnsavedDiscard = async () => {
    await navigatePending();
  };

  const handleUnsavedCancel = () => {
    setPendingPath(null);
  };

  const requestDeleteFile = (path: string) => {
    setDeleteConfirmPath(path);
  };

  const confirmDeleteFile = async () => {
    if (!slug || !deleteConfirmPath) return;
    try {
      await deleteFile(deleteConfirmPath);
      if (selectedPathRef.current === deleteConfirmPath) {
        // Prevent a late fetchAndSelect response from resurrecting the
        // just-deleted path via SELECT_FILE.
        if (pendingSelectionRef.current === deleteConfirmPath) {
          pendingSelectionRef.current = null;
        }
        editorDispatch({ type: "DESELECT_FILE" });
      }
    } finally {
      setDeleteConfirmPath(null);
    }
  };

  const cancelDeleteFile = () => {
    setDeleteConfirmPath(null);
  };

  const requestDeleteDir = (path: string) => {
    setDeleteConfirmDir(path);
  };

  const confirmDeleteDir = async () => {
    if (!slug || !deleteConfirmDir) return;
    try {
      await deleteDir(deleteConfirmDir);
      const selected = selectedPathRef.current;
      const affected = !!selected && (
        selected === deleteConfirmDir ||
        selected.startsWith(deleteConfirmDir + "/")
      );
      if (affected) {
        const pending = pendingSelectionRef.current;
        if (pending && (pending === deleteConfirmDir || pending.startsWith(deleteConfirmDir + "/"))) {
          pendingSelectionRef.current = null;
        }
        editorDispatch({ type: "DESELECT_FILE" });
      }
    } finally {
      setDeleteConfirmDir(null);
    }
  };

  const cancelDeleteDir = () => {
    setDeleteConfirmDir(null);
  };

  const renameEntry = async (oldPath: string, newName: string) => {
    if (!slug) return;
    const parentPath = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : null;
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    await rename(oldPath, newPath);

    // Translate any in-flight selection fetch to the renamed path so its
    // response isn't dropped-or-worse, dispatched under the stale path.
    const pending = pendingSelectionRef.current;
    if (pending === oldPath) {
      pendingSelectionRef.current = newPath;
    } else if (pending && pending.startsWith(oldPath + "/")) {
      pendingSelectionRef.current = newPath + pending.slice(oldPath.length);
    }

    const selected = selectedPathRef.current;
    if (selected) {
      if (selected === oldPath) {
        editorDispatch({ type: "RENAME_SELECTED", newPath });
      } else if (selected.startsWith(oldPath + "/")) {
        editorDispatch({ type: "RENAME_SELECTED", newPath: newPath + selected.slice(oldPath.length) });
      }
    }
  };

  const createFileInDir = async (dirPath: string | null, fileName: string) => {
    if (!slug) return;
    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
    await write(filePath, "");
    // Known-empty; skip the read round-trip. Claim the guard lane so any
    // in-flight fetchAndSelect that resolves after this point is dropped.
    pendingSelectionRef.current = filePath;
    editorDispatch({ type: "SELECT_FILE", path: filePath, content: "" });
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
    baseline,
    dirty,
    selectFile,
    saveCurrentFile,
    markDirty,
    unsavedDialogOpen: pendingPath !== null,
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
  };
}
