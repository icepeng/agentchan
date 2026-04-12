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

export interface EditorState {
  treeEntries: TreeEntry[];
  selectedPath: string | null;
  fileContent: string | null;
  localContent: string | null;
  dirty: boolean;
}

export type EditorAction =
  | { type: "SET_TREE"; entries: TreeEntry[] }
  | { type: "SELECT_FILE"; path: string; content: string }
  | { type: "SYNC_EXTERNAL_CONTENT"; content: string }
  | { type: "UPDATE_LOCAL_CONTENT"; content: string }
  | { type: "MARK_CLEAN" }
  | { type: "CLEAR" };
