import type { LibraryRepo } from "../repositories/library.repo.js";

export function createLibraryService(libraryRepo: LibraryRepo) {
  return {
    async listSkills() { return libraryRepo.listSkills(); },
    async getSkill(name: string) { return libraryRepo.getSkill(name); },
    async createSkill(name: string, content: string) { return libraryRepo.createSkill(name, content); },
    async updateSkill(name: string, content: string) { return libraryRepo.updateSkill(name, content); },
    async deleteSkill(name: string) { return libraryRepo.deleteSkill(name); },
    async listRenderers() { return libraryRepo.listRenderers(); },
    async getRenderer(name: string) { return libraryRepo.getRenderer(name); },
    async createRenderer(name: string, source: string) { return libraryRepo.createRenderer(name, source); },
    async updateRenderer(name: string, source: string) { return libraryRepo.updateRenderer(name, source); },
    async deleteRenderer(name: string) { return libraryRepo.deleteRenderer(name); },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
