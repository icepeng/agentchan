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

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

function notifyProjectFilesChanged(slug: string): void {
  window.dispatchEvent(new CustomEvent(PROJECT_FILES_CHANGED, { detail: { slug } }));
}

export function useProjectTree(slug: string | null) {
  return useSWR<{ entries: TreeEntry[] }>(slug ? qk.projectTree(slug) : null);
}

/**
 * File content is owned by the editor reducer, not SWR. Mutations here
 * kick off a tree revalidation (fire-and-forget) so the caller isn't
 * blocked on the GET round-trip before its own follow-up dispatch.
 */
export function useEditorMutations(slug: string | null) {
  const { mutate } = useSWRConfig();

  const refreshTree = () => {
    if (slug) void mutate(qk.projectTree(slug));
  };

  const write = async (path: string, content: string) => {
    if (!slug) throw new Error("write: slug required");
    await apiWrite(slug, path, content);
    refreshTree();
    notifyProjectFilesChanged(slug);
  };

  const removeFile = async (path: string) => {
    if (!slug) throw new Error("removeFile: slug required");
    await apiDeleteFile(slug, path);
    refreshTree();
    notifyProjectFilesChanged(slug);
  };

  const removeDir = async (path: string) => {
    if (!slug) throw new Error("removeDir: slug required");
    await apiDeleteDir(slug, path);
    refreshTree();
    notifyProjectFilesChanged(slug);
  };

  const rename = async (from: string, to: string) => {
    if (!slug) throw new Error("rename: slug required");
    await apiRename(slug, from, to);
    refreshTree();
    notifyProjectFilesChanged(slug);
  };

  const createDir = async (path: string) => {
    if (!slug) throw new Error("createDir: slug required");
    await apiCreateDir(slug, path);
    refreshTree();
    notifyProjectFilesChanged(slug);
  };

  const reveal = async (path: string) => {
    if (!slug) throw new Error("reveal: slug required");
    await apiReveal(slug, path);
  };

  return { write, removeFile, removeDir, rename, createDir, reveal };
}
