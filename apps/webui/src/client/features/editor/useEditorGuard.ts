import { useCallback } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import { useUIDispatch, type ViewMode } from "@/client/entities/ui/index.js";
import {
  useEditorState,
  useEditorDispatch,
  readProjectFile,
  writeProjectFile,
  type EditorPendingTransition,
} from "@/client/entities/editor/index.js";

/**
 * Guards mode switches and file selections against unsaved editor changes.
 *
 * When the editor is dirty, a transition request is stored in EditorContext
 * (pendingTransition) instead of firing immediately. `EditModePanel` observes
 * this flag to render `UnsavedDialog`; the user's choice (save/discard/cancel)
 * then either applies the pending transition or clears it.
 *
 * Safe to call from multiple components in parallel — all share the same
 * EditorContext/UIContext state.
 */
export function useEditorGuard() {
  const editor = useEditorState();
  const editorDispatch = useEditorDispatch();
  const uiDispatch = useUIDispatch();
  const project = useProjectState();
  const slug = project.activeProjectSlug;

  const applyTransition = useCallback(async (t: EditorPendingTransition) => {
    if (t.type === "change-mode") {
      uiDispatch({ type: "SET_VIEW_MODE", mode: t.mode });
      return;
    }
    if (!slug) return;
    const { content } = await readProjectFile(slug, t.path);
    editorDispatch({ type: "SELECT_FILE", path: t.path, content });
  }, [slug, editorDispatch, uiDispatch]);

  const requestViewMode = useCallback((mode: ViewMode) => {
    if (editor.dirty) {
      editorDispatch({
        type: "SET_PENDING_TRANSITION",
        transition: { type: "change-mode", mode },
      });
    } else {
      uiDispatch({ type: "SET_VIEW_MODE", mode });
    }
  }, [editor.dirty, editorDispatch, uiDispatch]);

  const requestSelectFile = useCallback((path: string) => {
    if (path === editor.selectedPath) return;
    if (editor.dirty) {
      editorDispatch({
        type: "SET_PENDING_TRANSITION",
        transition: { type: "select-file", path },
      });
    } else {
      void applyTransition({ type: "select-file", path });
    }
  }, [editor.selectedPath, editor.dirty, editorDispatch, applyTransition]);

  const saveCurrentFile = useCallback(async () => {
    if (!slug || !editor.selectedPath || editor.localContent === null) return;
    await writeProjectFile(slug, editor.selectedPath, editor.localContent);
    editorDispatch({ type: "MARK_CLEAN" });
  }, [slug, editor.selectedPath, editor.localContent, editorDispatch]);

  const handleUnsavedSave = useCallback(async () => {
    const pending = editor.pendingTransition;
    await saveCurrentFile();
    editorDispatch({ type: "CLEAR_PENDING_TRANSITION" });
    if (pending) await applyTransition(pending);
  }, [editor.pendingTransition, saveCurrentFile, editorDispatch, applyTransition]);

  const handleUnsavedDiscard = useCallback(async () => {
    const pending = editor.pendingTransition;
    editorDispatch({ type: "CLEAR_PENDING_TRANSITION" });
    if (pending) await applyTransition(pending);
  }, [editor.pendingTransition, editorDispatch, applyTransition]);

  const handleUnsavedCancel = useCallback(() => {
    editorDispatch({ type: "CLEAR_PENDING_TRANSITION" });
  }, [editorDispatch]);

  return {
    requestViewMode,
    requestSelectFile,
    saveCurrentFile,
    unsavedDialogOpen: editor.pendingTransition !== null,
    handleUnsavedSave,
    handleUnsavedDiscard,
    handleUnsavedCancel,
  };
}
