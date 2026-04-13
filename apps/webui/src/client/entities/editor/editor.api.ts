import { json } from "@/client/shared/api.js";
import type { TreeEntry } from "./editor.types.js";

export function fetchProjectTree(slug: string): Promise<{ entries: TreeEntry[] }> {
  return json(`/projects/${encodeURIComponent(slug)}/tree`);
}

export function readProjectFile(slug: string, path: string): Promise<{ content: string }> {
  return json(`/projects/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`);
}

export function writeProjectFile(slug: string, path: string, content: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function deleteProjectFile(slug: string, path: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

export function revealProjectFile(slug: string, path: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/file/reveal?path=${encodeURIComponent(path)}`, {
    method: "POST",
  });
}

export function deleteProjectDir(slug: string, path: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/dir?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

export function renameProjectEntry(slug: string, from: string, to: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/file/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
}

export function createProjectDir(slug: string, path: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}/dir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}
