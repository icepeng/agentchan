import useSWR, { useSWRConfig } from "swr";
import type { ReadmeDoc } from "@/client/shared/ReadmeView.js";
import { qk } from "@/client/shared/queryKeys.js";
import {
  saveTemplateOrder as apiSaveOrder,
  saveProjectAsTemplate as apiSaveAsTemplate,
  setTemplateTrust as apiSetTrust,
} from "./template.api.js";
import type { TemplateMeta } from "./template.types.js";

export function useTemplates() {
  return useSWR<TemplateMeta[]>(qk.templates());
}

export function useTemplateReadme(slug: string | null) {
  return useSWR<ReadmeDoc>(slug ? qk.templateReadme(slug) : null);
}

export function useTemplateMutations() {
  const { mutate } = useSWRConfig();

  const saveOrder = async (order: string[]) => {
    await apiSaveOrder(order);
    await mutate(qk.templates());
  };

  const saveAsTemplate = async (
    slug: string,
    payload: { name: string; description?: string; excludeFiles?: string[]; overwrite?: boolean },
  ) => {
    const result = await apiSaveAsTemplate(slug, payload);
    if (result.ok) await mutate(qk.templates());
    return result;
  };

  const setTrust = async (slug: string, trusted: boolean) => {
    await apiSetTrust(slug, trusted);
    // Cache-only invalidate: callers typically navigate away (project create
    // path), so the next mount will refetch on its own and we skip an extra
    // round-trip here.
    await mutate(qk.templates(), undefined, { revalidate: false });
  };

  return { saveOrder, saveAsTemplate, setTrust };
}
