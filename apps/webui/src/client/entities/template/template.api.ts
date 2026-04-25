import { json, BASE } from "@/client/shared/api.js";
import type { ReadmeDoc } from "@/client/shared/ReadmeView.js";
import type { TemplateMeta } from "./template.types.js";

export function fetchTemplates(): Promise<TemplateMeta[]> {
  return json("/templates");
}

export function fetchTemplateReadme(slug: string): Promise<ReadmeDoc> {
  return json(`/templates/${encodeURIComponent(slug)}/readme`);
}

export async function saveTemplateOrder(order: string[]): Promise<void> {
  await json<{ ok: boolean }>("/templates/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
}

export async function setTemplateTrust(slug: string, trusted: boolean): Promise<void> {
  await json<{ ok: boolean }>(`/templates/${encodeURIComponent(slug)}/trust`, {
    method: trusted ? "POST" : "DELETE",
  });
}

export async function saveProjectAsTemplate(
  slug: string,
  payload: {
    name: string;
    description?: string;
    excludeFiles?: string[];
    overwrite?: boolean;
  },
): Promise<{ ok: boolean; conflict?: boolean }> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(slug)}/save-as-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    return { ok: false, conflict: true };
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return { ok: true };
}
