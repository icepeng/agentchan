import { appendFile, readFile, mkdir, unlink, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { nanoid } from "nanoid";
import type { TreeNode, TreeNodeWithChildren, Conversation } from "../types.js";
import {
  computeActivePath,
  switchBranch as switchBranchInTree,
} from "./tree.js";
import {
  type ConversationHeader,
  type SessionMode,
  type BranchMarker,
  type ParsedConversation,
  parseConversationFile,
  buildTreeMap,
  deriveConversation,
  serializeConversation,
} from "./format.js";

// --- Public types ---

export interface LoadedConversation {
  conversation: Conversation;
  tree: Map<string, TreeNodeWithChildren>;
  activePath: string[];
}

export interface ConversationSnapshot {
  conversation: Conversation;
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

export interface ConversationStorage {
  // Conversation CRUD
  listConversations(projectSlug: string): Promise<Conversation[]>;
  getConversation(projectSlug: string, id: string): Promise<Conversation | null>;
  loadConversationWithTree(projectSlug: string, id: string): Promise<LoadedConversation | null>;
  loadSnapshot(projectSlug: string, id: string): Promise<ConversationSnapshot | null>;
  createConversation(projectSlug: string, provider: string, model: string, compactedFrom?: string, mode?: SessionMode): Promise<Conversation>;
  deleteConversation(projectSlug: string, id: string): Promise<void>;

  // Tree node operations
  appendNode(projectSlug: string, conversationId: string, node: TreeNode): Promise<void>;
  appendNodes(projectSlug: string, conversationId: string, nodes: TreeNode[]): Promise<void>;
  deleteSubtree(
    projectSlug: string,
    conversationId: string,
    nodeId: string,
  ): Promise<DeleteSubtreeResult>;
  switchBranch(
    projectSlug: string,
    conversationId: string,
    nodeId: string,
  ): Promise<SwitchBranchResult | null>;
}

// --- JSONL Implementation ---

export function createConversationStorage(projectsDir: string): ConversationStorage {
  // Path helpers
  function conversationsDir(projectSlug: string): string {
    return join(projectsDir, projectSlug, "conversations");
  }

  function conversationPath(projectSlug: string, id: string): string {
    return join(conversationsDir(projectSlug), `${id}.jsonl`);
  }

  async function ensureConversationsDir(slug: string): Promise<void> {
    await mkdir(conversationsDir(slug), { recursive: true });
  }

  async function appendJsonLines(path: string, items: unknown[]): Promise<void> {
    const body = items.map((item) => JSON.stringify(item) + "\n").join("");
    await appendFile(path, body);
  }

  async function writeNodeLines(
    projectSlug: string,
    conversationId: string,
    nodes: TreeNode[],
  ): Promise<void> {
    await ensureConversationsDir(projectSlug);
    await appendJsonLines(conversationPath(projectSlug, conversationId), nodes);
  }

  /** Read, parse, and build tree from a single conversation file. */
  async function readFull(projectSlug: string, id: string): Promise<(ParsedConversation & { tree: Map<string, TreeNodeWithChildren> }) | null> {
    const path = conversationPath(projectSlug, id);
    try {
      const content = await readFile(path, "utf-8");
      const parsed = parseConversationFile(content);
      const tree = buildTreeMap(parsed.nodes);
      return { ...parsed, tree };
    } catch {
      return null;
    }
  }

  return {
    async listConversations(projectSlug: string): Promise<Conversation[]> {
      const dir = conversationsDir(projectSlug);
      if (!existsSync(dir)) return [];

      const entries = await readdir(dir);
      const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

      const results = await Promise.all(
        jsonlFiles.map(async (file) => {
          const id = basename(file, ".jsonl");
          const data = await readFull(projectSlug, id);
          if (!data) return null;
          return deriveConversation(id, data.header, data.nodes, data.tree);
        }),
      );

      return results
        .filter((c): c is Conversation => c !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getConversation(projectSlug: string, id: string): Promise<Conversation | null> {
      const data = await readFull(projectSlug, id);
      if (!data) return null;
      return deriveConversation(id, data.header, data.nodes, data.tree);
    },

    async loadConversationWithTree(projectSlug: string, id: string): Promise<LoadedConversation | null> {
      const data = await readFull(projectSlug, id);
      if (!data) return null;
      const conversation = deriveConversation(id, data.header, data.nodes, data.tree);
      const activePath = conversation.rootNodeId ? computeActivePath(data.tree, conversation.rootNodeId) : [];
      return { conversation, tree: data.tree, activePath };
    },

    async loadSnapshot(projectSlug: string, id: string): Promise<ConversationSnapshot | null> {
      const loaded = await this.loadConversationWithTree(projectSlug, id);
      if (!loaded) return null;
      return {
        conversation: loaded.conversation,
        nodes: [...loaded.tree.values()],
        activePath: loaded.activePath,
      };
    },

    async createConversation(
      projectSlug: string,
      provider: string,
      model: string,
      compactedFrom?: string,
      mode?: SessionMode,
    ): Promise<Conversation> {
      await ensureConversationsDir(projectSlug);
      const id = nanoid(12);
      const now = Date.now();

      const header: ConversationHeader = {
        _header: true, createdAt: now, provider, model,
        ...(compactedFrom ? { compactedFrom } : {}),
        ...(mode ? { mode } : {}),
      };
      await writeFile(conversationPath(projectSlug, id), JSON.stringify(header) + "\n");

      return {
        id,
        title: "New conversation",
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

    async deleteConversation(projectSlug: string, id: string): Promise<void> {
      try {
        await unlink(conversationPath(projectSlug, id));
      } catch { /* ignore ENOENT */ }
    },

    async appendNode(projectSlug: string, conversationId: string, node: TreeNode): Promise<void> {
      await writeNodeLines(projectSlug, conversationId, [node]);
    },

    async appendNodes(projectSlug: string, conversationId: string, nodes: TreeNode[]): Promise<void> {
      if (nodes.length === 0) return;
      await writeNodeLines(projectSlug, conversationId, nodes);
    },

    async deleteSubtree(
      projectSlug: string,
      conversationId: string,
      nodeId: string,
    ): Promise<{ rootNodeId: string; activeLeafId: string; activePath: string[] }> {
      // Single file read: parse header + build tree
      const path = conversationPath(projectSlug, conversationId);
      const content = await readFile(path, "utf-8");
      const { headerLine, nodes } = parseConversationFile(content);
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

      await writeFile(path, serializeConversation(headerLine, tree), "utf-8");

      const rootNode = [...tree.values()].find((n) => !n.parentId);
      const rootNodeId = rootNode?.id ?? "";

      const activePath = rootNodeId ? computeActivePath(tree, rootNodeId) : [];
      const activeLeafId = activePath.length > 0 ? activePath[activePath.length - 1] : "";

      return { rootNodeId, activeLeafId, activePath };
    },

    async switchBranch(
      projectSlug: string,
      conversationId: string,
      nodeId: string,
    ): Promise<SwitchBranchResult | null> {
      const loaded = await this.loadConversationWithTree(projectSlug, conversationId);
      if (!loaded) return null;
      const tree = loaded.tree;
      if (!tree.has(nodeId)) return null;

      const { updatedNodes, newLeafId } = switchBranchInTree(tree, nodeId);
      const markers = updatedNodes
        .filter((n) => n.activeChildId)
        .map((n): BranchMarker => ({ _marker: "branch", nodeId: n.id, activeChildId: n.activeChildId! }));
      if (markers.length > 0) {
        const path = conversationPath(projectSlug, conversationId);
        await appendJsonLines(path, markers);
      }

      const { rootNodeId } = loaded.conversation;
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
