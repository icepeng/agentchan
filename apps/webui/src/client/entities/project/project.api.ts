import { json } from "@/client/shared/api.js";
import type { ReadmeDoc } from "@/client/shared/ReadmeView.js";
import type { Project, ProjectFile } from "./project.types.js";

// --- Project CRUD ---

export function fetchProjects(): Promise<Project[]> {
  return json("/projects");
}

export function createProject(name: string, fromTemplate?: string): Promise<Project> {
  return json("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(fromTemplate ? { fromTemplate } : {}) }),
  });
}

export function updateProject(
  slug: string,
  updates: { name?: string; notes?: string },
): Promise<Project> {
  return json(`/projects/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function deleteProject(slug: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

export function duplicateProject(sourceSlug: string, name: string): Promise<Project> {
  return json(`/projects/${encodeURIComponent(sourceSlug)}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// --- Client-side Rendering ---

export function fetchWorkspaceFiles(projectSlug: string): Promise<{ files: ProjectFile[] }> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/workspace/files`);
}

export function fetchTranspiledRenderer(projectSlug: string): Promise<{ js: string }> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/renderer.js`);
}

export function fetchProjectReadme(slug: string): Promise<ReadmeDoc> {
  return json(`/projects/${encodeURIComponent(slug)}/readme`);
}

