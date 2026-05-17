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
 * CodeMirror owns the live buffer; React tracks only the baseline
 * (`originalContent`) and a sticky `dirty` flag. `dirty` flips to true on the
 * first user edit of a session and stays true until SELECT_FILE / FILE_SAVED
 * / EXTERNAL_REFRESH / DESELECT_FILE clears it — round-trips back to baseline
 * don't clear it, keeping keystroke comparisons out of the hot path.
 */
export interface EditorState {
  selectedPath: string | null;
  originalContent: string | null;
  dirty: boolean;
}

export type EditorAction =
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "MARK_DIRTY" }
  | { type: "FILE_SAVED"; savedContent: string }
  | { type: "EXTERNAL_REFRESH"; path: string; content: string }
  | { type: "DESELECT_FILE" }
  | { type: "RENAME_SELECTED"; newPath: string }
  | { type: "CLEAR" };

/**
 * Imperative handle exposed by FileEditor. `getContent` returns the live
 * CodeMirror doc; returns null before mount or after unmount.
 */
export interface EditorAPI {
  getContent: () => string | null;
}
