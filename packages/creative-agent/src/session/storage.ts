import { appendFile, readFile, mkdir, unlink, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { nanoid } from "nanoid";
import type { TreeNode, TreeNodeWithChildren, Session } from "../types.js";
import {
  computeActivePath,
  switchBranch as switchBranchInTree,
} from "./tree.js";
import {
  CURRENT_SESSION_VERSION,
  type SessionHeader,
  type SessionMode,
  type BranchMarker,
  type ParsedSession,
  parseSessionFile,
  buildTreeMap,
  deriveSession,
  serializeSession,
} from "./format.js";

// --- Public types ---

export interface LoadedSession {
  session: Session;
  tree: Map<string, TreeNodeWithChildren>;
  activePath: string[];
}

export interface SessionSnapshot {
  session: Session;
  nodes: TreeNodeWithChildren[];
  activePath: string[];
}

export interface DeleteSubtreeResult {
  rootNodeId: string;
  activeLeafId: string;
  activePath: string[];
}

export interface SwitchBranchResult {
  activePath: string[];
  activeLeafId: string;
}

// --- Storage interface ---

export interface SessionStorage {
  // Session CRUD
  listSessions(projectSlug: string): Promise<Session[]>;
  getSession(projectSlug: string, id: string): Promise<Session | null>;
  loadSessionWithTree(projectSlug: string, id: string): Promise<LoadedSession | null>;
  loadSnapshot(projectSlug: string, id: string): Promise<SessionSnapshot | null>;
  createSession(projectSlug: string, provider: string, model: string, compactedFrom?: string, mode?: SessionMode): Promise<Session>;
  deleteSession(projectSlug: string, id: string): Promise<void>;

  // Tree node operations
  appendNode(projectSlug: string, sessionId: string, node: TreeNode): Promise<void>;
  appendNodes(projectSlug: string, sessionId: string, nodes: TreeNode[]): Promise<void>;
  deleteSubtree(
    projectSlug: string,
    sessionId: string,
    nodeId: string,
  ): Promise<DeleteSubtreeResult>;
  switchBranch(
    projectSlug: string,
    sessionId: string,
    nodeId: string,
  ): Promise<SwitchBranchResult | null>;
}

// --- JSONL Implementation ---

export function createSessionStorage(projectsDir: string): SessionStorage {
  // Path helpers
  function sessionsDir(projectSlug: string): string {
    return join(projectsDir, projectSlug, "sessions");
  }

  function sessionPath(projectSlug: string, id: string): string {
    return join(sessionsDir(projectSlug), `${id}.jsonl`);
  }

  async function ensureSessionsDir(slug: string): Promise<void> {
    await mkdir(sessionsDir(slug), { recursive: true });
  }

  async function appendJsonLines(path: string, items: unknown[]): Promise<void> {
    const body = items.map((item) => JSON.stringify(item) + "\n").join("");
    await appendFile(path, body);
  }

  async function writeNodeLines(
    projectSlug: string,
    sessionId: string,
    nodes: TreeNode[],
  ): Promise<void> {
    await ensureSessionsDir(projectSlug);
    await appendJsonLines(sessionPath(projectSlug, sessionId), nodes);
  }

  /** Read, parse, and build tree from a single session file. */
  async function readFull(projectSlug: string, id: string): Promise<(ParsedSession & { tree: Map<string, TreeNodeWithChildren> }) | null> {
    const path = sessionPath(projectSlug, id);
    try {
      const content = await readFile(path, "utf-8");
      const parsed = parseSessionFile(content);
      const tree = buildTreeMap(parsed.nodes);
      return { ...parsed, tree };
    } catch {
      return null;
    }
  }

  return {
    async listSessions(projectSlug: string): Promise<Session[]> {
      const dir = sessionsDir(projectSlug);
      if (!existsSync(dir)) return [];

      const entries = await readdir(dir);
      const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

      const results = await Promise.all(
        jsonlFiles.map(async (file) => {
          const id = basename(file, ".jsonl");
          const data = await readFull(projectSlug, id);
          if (!data) return null;
          return deriveSession(id, data.header, data.nodes, data.tree);
        }),
      );

      return results
        .filter((s): s is Session => s !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getSession(projectSlug: string, id: string): Promise<Session | null> {
      const data = await readFull(projectSlug, id);
      if (!data) return null;
      return deriveSession(id, data.header, data.nodes, data.tree);
    },

    async loadSessionWithTree(projectSlug: string, id: string): Promise<LoadedSession | null> {
      const data = await readFull(projectSlug, id);
      if (!data) return null;
      const session = deriveSession(id, data.header, data.nodes, data.tree);
      const activePath = session.rootNodeId ? computeActivePath(data.tree, session.rootNodeId) : [];
      return { session, tree: data.tree, activePath };
    },

    async loadSnapshot(projectSlug: string, id: string): Promise<SessionSnapshot | null> {
      const loaded = await this.loadSessionWithTree(projectSlug, id);
      if (!loaded) return null;
      return {
        session: loaded.session,
        nodes: [...loaded.tree.values()],
        activePath: loaded.activePath,
      };
    },

    async createSession(
      projectSlug: string,
      provider: string,
      model: string,
      compactedFrom?: string,
      mode?: SessionMode,
    ): Promise<Session> {
      await ensureSessionsDir(projectSlug);
      const id = nanoid(12);
      const now = Date.now();

      const header: SessionHeader = {
        _header: true, version: CURRENT_SESSION_VERSION, createdAt: now, provider, model,
        ...(compactedFrom ? { compactedFrom } : {}),
        ...(mode ? { mode } : {}),
      };
      await writeFile(sessionPath(projectSlug, id), JSON.stringify(header) + "\n");

      return {
        id,
        title: "New session",
        createdAt: now,
        updatedAt: now,
        rootNodeId: "",
        activeLeafId: "",
        provider,
        model,
        ...(compactedFrom ? { compactedFrom } : {}),
        ...(mode ? { mode } : {}),
      };
    },

    async deleteSession(projectSlug: string, id: string): Promise<void> {
      try {
        await unlink(sessionPath(projectSlug, id));
      } catch { /* ignore ENOENT */ }
    },

    async appendNode(projectSlug: string, sessionId: string, node: TreeNode): Promise<void> {
      await writeNodeLines(projectSlug, sessionId, [node]);
    },

    async appendNodes(projectSlug: string, sessionId: string, nodes: TreeNode[]): Promise<void> {
      if (nodes.length === 0) return;
      await writeNodeLines(projectSlug, sessionId, nodes);
    },

    async deleteSubtree(
      projectSlug: string,
      sessionId: string,
      nodeId: string,
    ): Promise<{ rootNodeId: string; activeLeafId: string; activePath: string[] }> {
      // Single file read: parse header + build tree
      const path = sessionPath(projectSlug, sessionId);
      const content = await readFile(path, "utf-8");
      const { headerLine, nodes } = parseSessionFile(content);
      const tree = buildTreeMap(nodes);

      const target = tree.get(nodeId);
      if (!target) throw new Error(`Node not found: ${nodeId}`);

      const toRemove = collectDescendants(tree, nodeId);

      if (target.parentId) {
        const parent = tree.get(target.parentId);
        if (parent) {
          parent.children = parent.children.filter((id) => !toRemove.has(id));
          if (parent.activeChildId && toRemove.has(parent.activeChildId)) {
            parent.activeChildId =
              parent.children.length > 0
                ? parent.children[parent.children.length - 1]
                : undefined;
          }
        }
      }

      for (const id of toRemove) {
        tree.delete(id);
      }

      if (tree.size === 0) {
        await writeFile(path, headerLine ? headerLine + "\n" : "", "utf-8");
        return { rootNodeId: "", activeLeafId: "", activePath: [] };
      }

      await writeFile(path, serializeSession(headerLine, tree), "utf-8");

      const rootNode = [...tree.values()].find((n) => !n.parentId);
      const rootNodeId = rootNode?.id ?? "";

      const activePath = rootNodeId ? computeActivePath(tree, rootNodeId) : [];
      const activeLeafId = activePath[activePath.length - 1] ?? "";

      return { rootNodeId, activeLeafId, activePath };
    },

    async switchBranch(
      projectSlug: string,
      sessionId: string,
      nodeId: string,
    ): Promise<SwitchBranchResult | null> {
      const loaded = await this.loadSessionWithTree(projectSlug, sessionId);
      if (!loaded) return null;
      const tree = loaded.tree;
      if (!tree.has(nodeId)) return null;

      const { updatedNodes, newLeafId } = switchBranchInTree(tree, nodeId);
      const markers = updatedNodes
        .filter((n) => n.activeChildId)
        .map((n): BranchMarker => ({ _marker: "branch", nodeId: n.id, activeChildId: n.activeChildId! }));
      if (markers.length > 0) {
        const path = sessionPath(projectSlug, sessionId);
        await appendJsonLines(path, markers);
      }

      const { rootNodeId } = loaded.session;
      const activePath = rootNodeId ? computeActivePath(tree, rootNodeId) : [];
      return { activePath, activeLeafId: newLeafId };
    },
  };
}

function collectDescendants(
  nodes: Map<string, TreeNodeWithChildren>,
  nodeId: string,
): Set<string> {
  const toRemove = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    toRemove.add(id);
    const node = nodes.get(id);
    if (node) {
      queue.push(...node.children);
    }
  }
  return toRemove;
}
