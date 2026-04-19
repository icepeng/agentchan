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
 * Invariant: `selectedPath` set ⇔ `originalContent` and `buffer` set.
 * SELECT_FILE carries the content payload, so there is no transient
 * "selected but empty" state that sync effects would otherwise need to
 * paper over. `dirty` is derived (`buffer !== originalContent`).
 */
export interface EditorState {
  selectedPath: string | null;
  originalContent: string | null;
  buffer: string | null;
}

export type EditorAction =
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "UPDATE_BUFFER"; content: string }
  | { type: "FILE_SAVED"; savedContent: string }
  | { type: "EXTERNAL_REFRESH"; path: string; content: string }
  | { type: "DESELECT_FILE" }
  | { type: "RENAME_SELECTED"; newPath: string }
  | { type: "CLEAR" };
