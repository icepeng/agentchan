import useSWR, { useSWRConfig } from "swr";
import type { ReadmeDoc } from "@/client/shared/ReadmeView.js";
import { qk, matchesSlug } from "@/client/shared/queryKeys.js";
import {
  fetchWorkspaceFiles,
  fetchTranspiledRenderer,
  createProject as apiCreate,
  updateProject as apiUpdate,
  deleteProject as apiDelete,
  duplicateProject as apiDuplicate,
} from "./project.api.js";
import type { Project, ProjectFile } from "./project.types.js";

export function useProjects() {
  return useSWR<Project[]>(qk.projects());
}

export function useProjectReadme(slug: string | null) {
  return useSWR<ReadmeDoc>(slug ? qk.projectReadme(slug) : null);
}

export function useWorkspaceFiles(slug: string | null) {
  return useSWR<{ files: ProjectFile[] }>(
    slug ? qk.workspaceFiles(slug) : null,
    () => fetchWorkspaceFiles(slug as string),
  );
}

export function useRendererJs(slug: string | null) {
  return useSWR<{ js: string }>(
    slug ? qk.rendererJs(slug) : null,
    () => fetchTranspiledRenderer(slug as string),
  );
}

/**
 * Project mutations. `deleteProject` evicts every cache entry tagged with
 * the slug — predicate matcher walks all keys so per-project session
 * lists, tree, file content, etc. don't linger.
 */
export function useProjectMutations() {
  const { mutate } = useSWRConfig();

  const create = async (name: string, fromTemplate?: string) => {
    const project = await apiCreate(name, fromTemplate);
    await mutate(qk.projects());
    return project;
  };

  const update = async (slug: string, updates: { name?: string; notes?: string }) => {
    const project = await apiUpdate(slug, updates);
    await mutate(qk.projects());
    // If slug changed (rename), the old per-project keys become stale —
    // evict and let consumers refetch under the new slug.
    if (project.slug !== slug) {
      await mutate(matchesSlug(slug), undefined, { revalidate: false });
    }
    return project;
  };

  const remove = async (slug: string) => {
    await apiDelete(slug);
    await mutate(qk.projects());
    await mutate(matchesSlug(slug), undefined, { revalidate: false });
  };

  const duplicate = async (sourceSlug: string, name: string) => {
    const project = await apiDuplicate(sourceSlug, name);
    await mutate(qk.projects());
    return project;
  };

  return { create, update, remove, duplicate };
}
