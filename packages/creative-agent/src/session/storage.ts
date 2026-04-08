import { appendFile, readFile, mkdir, unlink, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { nanoid } from "nanoid";
import type { TreeNode, TreeNodeWithChildren, Conversation } from "../types.js";
import { isSkillContentBlock } from "../skills/skill-content-detect.js";
import { computeActivePath, generateTitle } from "./tree.js";

// --- Helpers ---

export function slugify(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[A-Z]/g, (c) => c.toLowerCase())
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}

// --- Conversation header ---

interface ConversationHeader {
  _header: true;
  createdAt: number;
  provider: string;
  model: string;
  compactedFrom?: string;
}

interface ParsedConversation {
  headerLine: string | null;
  header: ConversationHeader | null;
  nodes: TreeNode[];
}

function parseConversationFile(content: string): ParsedConversation {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { headerLine: null, header: null, nodes: [] };

  let headerLine: string | null = null;
  let header: ConversationHeader | null = null;
  let startIdx = 0;
  try {
    const first = JSON.parse(lines[0]);
    if (first._header) {
      headerLine = lines[0];
      header = first as ConversationHeader;
      startIdx = 1;
    }
  } catch { /* not valid JSON — treat all as nodes */ }

  const nodes = lines.slice(startIdx).map((line) => JSON.parse(line) as TreeNode);
  return { headerLine, header, nodes };
}

function buildTreeMap(nodes: TreeNode[]): Map<string, TreeNodeWithChildren> {
  const map = new Map<string, TreeNodeWithChildren>();
  for (const node of nodes) map.set(node.id, { ...node, children: [] });
  for (const node of map.values()) {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node.id);
    }
  }
  return map;
}

function deriveConversation(
  id: string,
  header: ConversationHeader | null,
  nodes: TreeNode[],
  tree?: Map<string, TreeNodeWithChildren>,
): Conversation {
  // Skip skill_content user nodes (auto-invoked always-active blocks and slash
  // invocations) — they're noise as a title and would expose raw skill bodies.
  let title = "New conversation";
  for (const n of nodes) {
    if (n.role !== "user") continue;
    const textBlock = n.content.find(
      (b) => b.type === "text" && !isSkillContentBlock(b),
    );
    if (textBlock?.type === "text") {
      title = generateTitle(textBlock.text);
      break;
    }
  }

  const createdAt = header?.createdAt ?? nodes[0]?.createdAt ?? Date.now();
  const updatedAt = nodes.length > 0 ? nodes[nodes.length - 1].createdAt : createdAt;

  const rootNode = nodes.find((n) => n.parentId === null);
  const rootNodeId = rootNode?.id ?? "";

  let activeLeafId = "";
  if (rootNodeId) {
    const treeMap = tree ?? buildTreeMap(nodes);
    const path = computeActivePath(treeMap, rootNodeId);
    activeLeafId = path.length > 0 ? path[path.length - 1] : "";
  }

  // Backward search — avoids copying the array
  let lastAssistant: TreeNode | undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].role === "assistant") { lastAssistant = nodes[i]; break; }
  }
  const provider = lastAssistant?.provider ?? header?.provider ?? "";
  const model = lastAssistant?.model ?? header?.model ?? "";

  return {
    id, title, createdAt, updatedAt, rootNodeId, activeLeafId, provider, model,
    ...(header?.compactedFrom ? { compactedFrom: header.compactedFrom } : {}),
  };
}

function rewriteConversationFile(
  path: string,
  headerLine: string | null,
  tree: Map<string, TreeNodeWithChildren>,
): Promise<void> {
  const allNodes = [...tree.values()].map(({ children, ...node }) => node);
  const nodeContent = allNodes.map((n) => JSON.stringify(n)).join("\n") + "\n";
  const content = headerLine ? headerLine + "\n" + nodeContent : nodeContent;
  return writeFile(path, content, "utf-8");
}

// --- Storage interface ---

export interface LoadedConversation {
  conversation: Conversation;
  tree: Map<string, TreeNodeWithChildren>;
  activePath: string[];
}

export interface SessionStorage {
  // Conversation CRUD
  listConversations(projectSlug: string): Promise<Conversation[]>;
  getConversation(projectSlug: string, id: string): Promise<Conversation | null>;
  loadConversationWithTree(projectSlug: string, id: string): Promise<LoadedConversation | null>;
  createConversation(projectSlug: string, provider: string, model: string, compactedFrom?: string): Promise<Conversation>;
  deleteConversation(projectSlug: string, id: string): Promise<void>;

  // Tree node operations
  appendNode(projectSlug: string, conversationId: string, node: TreeNode): Promise<void>;
  loadTree(projectSlug: string, conversationId: string): Promise<Map<string, TreeNodeWithChildren>>;
  persistActiveChildUpdates(
    projectSlug: string,
    conversationId: string,
    nodes: Map<string, TreeNodeWithChildren>,
  ): Promise<void>;
  deleteSubtree(
    projectSlug: string,
    conversationId: string,
    nodeId: string,
  ): Promise<{ rootNodeId: string; activeLeafId: string; activePath: string[] }>;
}

// --- JSONL Implementation ---

export function createSessionStorage(projectsDir: string): SessionStorage {
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

    async createConversation(
      projectSlug: string,
      provider: string,
      model: string,
      compactedFrom?: string,
    ): Promise<Conversation> {
      await ensureConversationsDir(projectSlug);
      const id = nanoid(12);
      const now = Date.now();

      const header: ConversationHeader = {
        _header: true, createdAt: now, provider, model,
        ...(compactedFrom ? { compactedFrom } : {}),
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
      };
    },

    async deleteConversation(projectSlug: string, id: string): Promise<void> {
      try {
        await unlink(conversationPath(projectSlug, id));
      } catch { /* ignore ENOENT */ }
    },

    async appendNode(projectSlug: string, conversationId: string, node: TreeNode): Promise<void> {
      await ensureConversationsDir(projectSlug);
      await appendFile(conversationPath(projectSlug, conversationId), JSON.stringify(node) + "\n");
    },

    async loadTree(
      projectSlug: string,
      conversationId: string,
    ): Promise<Map<string, TreeNodeWithChildren>> {
      const path = conversationPath(projectSlug, conversationId);
      try {
        const content = await readFile(path, "utf-8");
        const { nodes } = parseConversationFile(content);
        return buildTreeMap(nodes);
      } catch {
        return new Map();
      }
    },

    async persistActiveChildUpdates(
      projectSlug: string,
      conversationId: string,
      nodes: Map<string, TreeNodeWithChildren>,
    ): Promise<void> {
      const path = conversationPath(projectSlug, conversationId);
      const content = await readFile(path, "utf-8");
      const { headerLine } = parseConversationFile(content);
      await rewriteConversationFile(path, headerLine, nodes);
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

      await rewriteConversationFile(path, headerLine, tree);

      const rootNode = [...tree.values()].find((n) => !n.parentId);
      const rootNodeId = rootNode?.id ?? "";

      const activePath = rootNodeId ? computeActivePath(tree, rootNodeId) : [];
      const activeLeafId = activePath.length > 0 ? activePath[activePath.length - 1] : "";

      return { rootNodeId, activeLeafId, activePath };
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
