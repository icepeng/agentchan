export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "ico"]);

export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  modifiedAt?: number;
}

// Local literal for view mode to avoid cross-entity import from entities/ui.
// Must stay in sync with ViewMode in entities/ui/UIContext.tsx.
export type EditorPendingTransition =
  | { type: "select-file"; path: string }
  | { type: "change-mode"; mode: "chat" | "edit" };

export interface EditorState {
  treeEntries: TreeEntry[];
  selectedPath: string | null;
  fileContent: string | null;
  localContent: string | null;
  dirty: boolean;
  pendingTransition: EditorPendingTransition | null;
}

export type EditorAction =
  | { type: "SET_TREE"; entries: TreeEntry[] }
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "SYNC_EXTERNAL_CONTENT"; content: string }
  | { type: "UPDATE_LOCAL_CONTENT"; content: string }
  | { type: "MARK_CLEAN" }
  | { type: "DESELECT_FILE" }
  | { type: "RENAME_SELECTED"; newPath: string }
  | { type: "CLEAR" }
  | { type: "SET_PENDING_TRANSITION"; transition: EditorPendingTransition }
  | { type: "CLEAR_PENDING_TRANSITION" };
