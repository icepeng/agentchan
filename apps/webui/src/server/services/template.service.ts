import type { TemplateRepo } from "../repositories/template.repo.js";

export function createTemplateService(templateRepo: TemplateRepo) {
  return {
    async list() { return templateRepo.list(); },
    getSourceDir(name: string) { return templateRepo.getSourceDir(name); },
  };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
