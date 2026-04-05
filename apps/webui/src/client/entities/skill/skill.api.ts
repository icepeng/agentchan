import { json } from "@/client/shared/api.js";
import type { SkillMetadata } from "./skill.types.js";

// --- Project Skills ---

export function fetchSkills(projectSlug: string): Promise<SkillMetadata[]> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills`);
}

export function fetchProjectSkill(projectSlug: string, name: string): Promise<{ content: string }> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills/${encodeURIComponent(name)}`);
}

export function createProjectSkill(projectSlug: string, name: string, content: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
}

export function copyLibrarySkillToProject(projectSlug: string, librarySkillName: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromLibrary: librarySkillName }),
  });
}

export function updateProjectSkill(projectSlug: string, name: string, content: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function deleteProjectSkill(projectSlug: string, name: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/skills/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// --- Library Skills ---

export function fetchLibrarySkills(): Promise<SkillMetadata[]> {
  return json("/library/skills");
}

export function fetchLibrarySkill(name: string): Promise<{ content: string }> {
  return json(`/library/skills/${encodeURIComponent(name)}`);
}

export function createLibrarySkill(name: string, content: string): Promise<void> {
  return json("/library/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
}

export function updateLibrarySkill(name: string, content: string): Promise<void> {
  return json(`/library/skills/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function deleteLibrarySkill(name: string): Promise<void> {
  return json(`/library/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// --- Library Renderers ---

export function fetchLibraryRenderers(): Promise<{ name: string }[]> {
  return json("/library/renderers");
}

export function fetchLibraryRenderer(name: string): Promise<{ source: string }> {
  return json(`/library/renderers/${encodeURIComponent(name)}`);
}

export function createLibraryRenderer(name: string, source: string): Promise<void> {
  return json("/library/renderers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source }),
  });
}

export function updateLibraryRenderer(name: string, source: string): Promise<void> {
  return json(`/library/renderers/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
}

export function deleteLibraryRenderer(name: string): Promise<void> {
  return json(`/library/renderers/${encodeURIComponent(name)}`, { method: "DELETE" });
}
