import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SessionManager,
  type SessionEntry,
} from "@mariozechner/pi-coding-agent";

import type {
  ProjectSessionInfo,
  ProjectSessionState,
  SessionMode,
} from "../types.js";
import {
  AGENTCHAN_SESSION_TYPE,
  getSessionModeFromEntries,
} from "./metadata.js";

export interface SwitchBranchResult {
  branch: SessionEntry[];
  leafId: string | null;
}

export interface SessionStorage {
  listSessions(projectSlug: string): Promise<ProjectSessionInfo[]>;
  getSession(projectSlug: string, id: string): Promise<ProjectSessionInfo | null>;
  loadState(projectSlug: string, id: string, leafId?: LeafSelector): Promise<ProjectSessionState | null>;
  createSession(projectSlug: string, provider: string, model: string, mode?: SessionMode): Promise<ProjectSessionInfo>;
  deleteSession(projectSlug: string, id: string): Promise<void>;
  openManager(projectSlug: string, id: string): Promise<SessionManager | null>;
  flush(manager: SessionManager): Promise<void>;
  snapshot(manager: SessionManager, leafId?: LeafSelector): ProjectSessionState | null;
  switchBranch(projectSlug: string, sessionId: string, entryId: string): Promise<SwitchBranchResult | null>;
}

export function createSessionStorage(projectsDir: string): SessionStorage {
  function projectDir(projectSlug: string): string {
    return join(projectsDir, projectSlug);
  }

  function sessionsDir(projectSlug: string): string {
    return join(projectDir(projectSlug), "sessions");
  }

  async function open(projectSlug: string, id: string): Promise<SessionManager | null> {
    const sessionDir = sessionsDir(projectSlug);
    const path = await findSessionPath(sessionDir, id);
    return path ? SessionManager.open(path, sessionDir, projectDir(projectSlug)) : null;
  }

  return {
    async listSessions(projectSlug) {
      const infos = await SessionManager.list(projectDir(projectSlug), sessionsDir(projectSlug));
      return infos.map((info) => withAgentchanMetadata(SessionManager.open(
        info.path,
        sessionsDir(projectSlug),
        projectDir(projectSlug),
      ), info));
    },

    async getSession(projectSlug, id) {
      const manager = await open(projectSlug, id);
      return manager ? sessionInfoFromManager(manager) : null;
    },

    async loadState(projectSlug, id, leafId) {
      const manager = await open(projectSlug, id);
      if (!manager) return null;
      return stateFromManager(manager, leafId);
    },

    async createSession(projectSlug, provider, model, mode) {
      await mkdir(sessionsDir(projectSlug), { recursive: true });
      const manager = SessionManager.create(projectDir(projectSlug), sessionsDir(projectSlug));
      if (mode) manager.appendCustomEntry(AGENTCHAN_SESSION_TYPE, { mode });
      manager.appendModelChange(provider, model);
      await forceFlush(manager);
      return sessionInfoFromManager(manager);
    },

    async deleteSession(projectSlug, id) {
      const manager = await open(projectSlug, id);
      const path = manager?.getSessionFile();
      if (path) await unlink(path);
    },

    openManager: open,

    flush: forceFlush,
    snapshot: stateFromManager,

    async switchBranch(projectSlug, sessionId, entryId) {
      const manager = await open(projectSlug, sessionId);
      if (!manager?.getEntry(entryId)) return null;
      return { branch: manager.getBranch(entryId), leafId: entryId };
    },
  };
}

async function findSessionPath(sessionDir: string, id: string): Promise<string | null> {
  try {
    const names = await readdir(sessionDir);
    const name = names.find((candidate) => candidate.endsWith(`_${id}.jsonl`));
    return name ? join(sessionDir, name) : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function forceFlush(manager: SessionManager): Promise<void> {
  const sessionFile = manager.getSessionFile();
  const header = manager.getHeader();
  if (!sessionFile || !header) return;
  const entries = [header, ...manager.getEntries()];
  await writeFile(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  markFlushed(manager);
}

type LeafSelector =
  | undefined // use the manager's current in-memory leaf
  | null // project an empty branch before the first entry
  | string; // project the branch ending at a specific entry

function stateFromManager(
  manager: SessionManager,
  leafId?: LeafSelector,
): ProjectSessionState | null {
  if (leafId && !manager.getEntry(leafId)) return null;
  const branch = leafId === null ? [] : manager.getBranch(leafId);
  return {
    info: sessionInfoFromManager(manager),
    entries: manager.getEntries(),
    branch,
    leafId: leafId === undefined ? manager.getLeafId() : leafId,
  };
}

function markFlushed(manager: SessionManager): void {
  // Pi exposes no public flush; avoid setSessionFile(), which reloads and resets the in-memory leaf.
  (manager as unknown as { flushed: boolean }).flushed = true;
}

function sessionInfoFromManager(manager: SessionManager): ProjectSessionInfo {
  const file = manager.getSessionFile();
  const fallback: ProjectSessionInfo = {
    path: file ?? "",
    id: manager.getSessionId(),
    cwd: manager.getCwd(),
    created: new Date(manager.getHeader()?.timestamp ?? Date.now()),
    modified: new Date(),
    messageCount: 0,
    firstMessage: "(no messages)",
    allMessagesText: "",
  };
  return withAgentchanMetadata(manager, fallback);
}

function withAgentchanMetadata(
  manager: SessionManager,
  info: ProjectSessionInfo,
): ProjectSessionInfo {
  const mode = getSessionModeFromEntries(manager.getEntries());
  return {
    ...info,
    ...(mode ? { mode } : {}),
  };
}
