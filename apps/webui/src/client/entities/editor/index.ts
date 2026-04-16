export { EditorProvider, useEditorState, useEditorDispatch } from "./EditorContext.js";
export { fetchProjectTree, readProjectFile, writeProjectFile, deleteProjectFile, revealProjectFile, deleteProjectDir, renameProjectEntry, createProjectDir } from "./editor.api.js";
export type { TreeEntry, EditorState, EditorAction } from "./editor.types.js";
export { IMAGE_EXTS, isImagePath } from "./editor.types.js";
export { buildTree, FileIcon, type TreeNode } from "./file-tree.utils.js";
export { rendererCompletions, prefetchRendererTypes } from "./rendererDts.js";
