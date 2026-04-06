import { createSessionStorage, type SessionStorage } from "@agentchan/creative-agent";

export function createConversationRepo(projectsDir: string): SessionStorage {
  return createSessionStorage(projectsDir);
}

export type ConversationRepo = SessionStorage;
