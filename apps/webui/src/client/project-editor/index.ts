export { ProjectEditor } from "./ProjectEditor.js";
export { ProjectEditorProvider } from "./EditorContext.js";
export { EditModeErrorFallback } from "./EditModeErrorFallback.js";
export { useProjectEditor } from "./useProjectEditor.js";
export {
  fetchProjectTree,
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
  revealProjectFile,
  deleteProjectDir,
  renameProjectEntry,
  createProjectDir,
} from "./editor.api.js";
export type { TreeEntry, EditorAPI } from "./editor.types.js";
export { IMAGE_EXTS, isImagePath } from "./editor.types.js";
export { buildTree, FileIcon, type TreeNode } from "./file-tree.utils.js";
