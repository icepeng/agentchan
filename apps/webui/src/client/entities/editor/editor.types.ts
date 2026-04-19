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
 * Single source of truth for file content is the SWR cache (`useFileContent`).
 * `buffer` is a client-only shadow that only exists while the user is editing;
 * `dirty` is derived (`buffer !== null && buffer !== serverContent`) rather
 * than stored — that way there is no sync effect to go out of step with.
 */
export interface EditorState {
  selectedPath: string | null;
  buffer: string | null;
}

export type EditorAction =
  | { type: "SELECT_FILE"; path: string }
  | { type: "UPDATE_BUFFER"; content: string }
  | { type: "DISCARD_BUFFER"; ifEquals: string }
  | { type: "DESELECT_FILE" }
  | { type: "RENAME_SELECTED"; newPath: string }
  | { type: "CLEAR" };
