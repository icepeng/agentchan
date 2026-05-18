import { useState } from "react";
import type { ReactNode } from "react";
import { useSWRConfig } from "swr";
import {
  TrustTemplateDialog,
  setTemplateTrust,
  useTemplates,
} from "@/client/library/index.js";
import { qk } from "@/client/platform/index.js";
import type { Project } from "./project.types.js";
import type { TemplateMeta } from "@/client/library/index.js";
import { useProject } from "./useProject.js";

type PendingTrust = {
  projectName: string;
  templateSlug: string;
  templateName: string;
  resolve: (project: Project | null) => void;
  reject: (error: unknown) => void;
};

export function useCreateProjectFromTemplate(): {
  createFromTemplate: (projectName: string, templateSlug: string) => Promise<Project | null>;
  trustDialog: ReactNode;
} {
  const { createProject } = useProject();
  const { data: templates } = useTemplates();
  const { mutate } = useSWRConfig();
  const [pendingTrust, setPendingTrust] = useState<PendingTrust | null>(null);

  const createFromTemplate = async (projectName: string, templateSlug: string) => {
    const templateList = templates ?? await mutate<TemplateMeta[]>(qk.templates());
    const template = templateList?.find((tpl) => tpl.slug === templateSlug) ?? null;
    if (!template) {
      return null;
    }
    if (template.trusted) {
      return createProject(projectName, templateSlug);
    }

    return new Promise<Project | null>((resolve, reject) => {
      setPendingTrust({
        projectName,
        templateSlug,
        templateName: template.name,
        resolve,
        reject,
      });
    });
  };

  const handleCancel = () => {
    pendingTrust?.resolve(null);
    setPendingTrust(null);
  };

  const handleConfirm = async () => {
    if (!pendingTrust) return;
    try {
      await setTemplateTrust(pendingTrust.templateSlug, true);
      await mutate<TemplateMeta[]>(
        qk.templates(),
        (current) => current?.map((tpl) => (
          tpl.slug === pendingTrust.templateSlug ? { ...tpl, trusted: true } : tpl
        )),
        { revalidate: false, populateCache: true },
      );
      const project = await createProject(pendingTrust.projectName, pendingTrust.templateSlug);
      pendingTrust.resolve(project);
      setPendingTrust(null);
    } catch (error) {
      pendingTrust.reject(error);
      setPendingTrust(null);
      throw error;
    }
  };

  return {
    createFromTemplate,
    trustDialog: (
      <TrustTemplateDialog
        open={pendingTrust !== null}
        templateName={pendingTrust?.templateName ?? ""}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    ),
  };
}
