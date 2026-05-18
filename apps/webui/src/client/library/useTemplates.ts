import useSWR from "swr";
import { qk } from "@/client/platform/index.js";
import type { ReadmeDoc, TemplateMeta } from "./template.types.js";

export function useTemplates() {
  return useSWR<TemplateMeta[]>(qk.templates());
}

export function useTemplateReadme(slug: string | null) {
  return useSWR<ReadmeDoc>(slug ? qk.templateReadme(slug) : null);
}
