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

// --- Project System (SYSTEM.md) ---

export function fetchProjectSystem(projectSlug: string): Promise<{ content: string }> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/system`);
}

export function saveProjectSystem(projectSlug: string, content: string): Promise<void> {
  return json(`/projects/${encodeURIComponent(projectSlug)}/system`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
