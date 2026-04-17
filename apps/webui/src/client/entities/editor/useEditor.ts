import useSWR, { useSWRConfig } from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import {
  writeProjectFile as apiWrite,
  deleteProjectFile as apiDeleteFile,
  deleteProjectDir as apiDeleteDir,
  renameProjectEntry as apiRename,
  createProjectDir as apiCreateDir,
  revealProjectFile as apiReveal,
} from "./editor.api.js";
import type { TreeEntry } from "./editor.types.js";

export function useProjectTree(slug: string | null) {
  return useSWR<{ entries: TreeEntry[] }>(slug ? qk.projectTree(slug) : null);
}

export function useFileContent(slug: string | null, path: string | null) {
  return useSWR<{ content: string }>(slug && path ? qk.projectFile(slug, path) : null);
}

/**
 * Editor mutations. `write` seeds the file cache so the editor doesn't
 * round-trip after save. Tree-shape changes (delete/rename/createDir)
 * invalidate the tree key and selectively migrate file content cache.
 */
export function useEditorMutations(slug: string | null) {
  const { mutate } = useSWRConfig();

  const write = async (path: string, content: string) => {
    if (!slug) throw new Error("write: slug required");
    await apiWrite(slug, path, content);
    await mutate(qk.projectFile(slug, path), { content }, { revalidate: false });
    // Tree's modifiedAt for this entry shifts — keep the list in sync.
    await mutate(qk.projectTree(slug));
  };

  const removeFile = async (path: string) => {
    if (!slug) throw new Error("removeFile: slug required");
    await apiDeleteFile(slug, path);
    await mutate(qk.projectTree(slug));
    await mutate(qk.projectFile(slug, path), undefined, { revalidate: false });
  };

  const removeDir = async (path: string) => {
    if (!slug) throw new Error("removeDir: slug required");
    await apiDeleteDir(slug, path);
    await mutate(qk.projectTree(slug));
    // Evict any cached files under this directory prefix.
    await mutate(
      (k) =>
        Array.isArray(k) &&
        k[0] === "projectFile" &&
        k[1] === slug &&
        typeof k[2] === "string" &&
        k[2].startsWith(path + "/"),
      undefined,
      { revalidate: false },
    );
  };

  const rename = async (from: string, to: string) => {
    if (!slug) throw new Error("rename: slug required");
    await apiRename(slug, from, to);
    await mutate(qk.projectTree(slug));
    // Move the file content cache to the new key (if loaded).
    await mutate(qk.projectFile(slug, from), undefined, { revalidate: false });
    await mutate(qk.projectFile(slug, to));
  };

  const createDir = async (path: string) => {
    if (!slug) throw new Error("createDir: slug required");
    await apiCreateDir(slug, path);
    await mutate(qk.projectTree(slug));
  };

  const reveal = async (path: string) => {
    if (!slug) throw new Error("reveal: slug required");
    await apiReveal(slug, path);
  };

  return { write, removeFile, removeDir, rename, createDir, reveal };
}
