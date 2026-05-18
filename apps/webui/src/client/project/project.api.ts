import { json } from "@/client/platform/index.js";
import type { Project, ReadmeDoc } from "./project.types.js";

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

export function fetchProjectReadme(slug: string): Promise<ReadmeDoc> {
  return json(`/projects/${encodeURIComponent(slug)}/readme`);
}
