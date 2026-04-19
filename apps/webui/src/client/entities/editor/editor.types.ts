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

/**
 * Slim editor state — only the truly client-side bits. Tree entries and
 * canonical file content come from SWR (`useProjectTree`, `useFileContent`);
 * `dirty` is recomputed each UPDATE_LOCAL_CONTENT against the server baseline
 * passed in the action (not stored here), so spurious listener events that
 * re-emit the same text don't flip dirty=true.
 */
export interface EditorState {
  selectedPath: string | null;
  localContent: string | null;
  dirty: boolean;
}

export type EditorAction =
  | { type: "SELECT_FILE"; path: string }
  | { type: "SYNC_EXTERNAL_CONTENT"; content: string }
  | { type: "UPDATE_LOCAL_CONTENT"; content: string; serverContent: string }
  | { type: "MARK_CLEAN" }
  | { type: "DESELECT_FILE" }
  | { type: "RENAME_SELECTED"; newPath: string }
  | { type: "CLEAR" };
