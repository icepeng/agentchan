/**
 * CreativeWorkspace owns one projectsDir, brokers all conversation
 * persistence through a single SessionStorage, and hands out cached
 * CreativeSession instances. Webui holds exactly one Workspace and never
 * touches SessionStorage directly.
 */

import { join } from "node:path";
import { nanoid } from "nanoid";

import type {
  Conversation,
  TreeNode,
  TreeNodeWithChildren,
} from "../types.js";
import {
  createSessionStorage,
  type SessionStorage,
  type LoadedConversation,
} from "../session/storage.js";
import { fullCompact } from "../agent/compact.js";
import { storedToPiMessages } from "../agent/convert.js";
import { flattenPathToMessages } from "../session/tree.js";
import { resolveModel, clearSkillManager } from "../agent/orchestrator.js";
import { discoverProjectSkills } from "../skills/discovery.js";

import { CreativeSession, type ResolvedAgentConfig } from "./session.js";
import { buildAlwaysActiveSeedNode } from "./seed.js";

// --- Public types ---

export interface CreativeWorkspaceOptions {
  projectsDir: string;
  /**
   * Resolves the LLM/provider config. Called every time a Session needs to
   * spin up an Agent — keeps Workspace decoupled from webui's ConfigService.
   */
  resolveAgentConfig: () => ResolvedAgentConfig;
  /** Maximum number of cached Session instances. Default 20. */
  sessionCacheLimit?: number;
  /**
   * Idle TTL for cached sessions (ms). 0 disables idle eviction. Default 30 min.
   */
  sessionIdleTtlMs?: number;
}

export interface CreatedConversation {
  conversation: Conversation;
  /** Seed nodes (always-active skills) inserted at creation time. */
  nodes: TreeNode[];
}

export interface ConversationSnapshot {
  conversation: Conversation;
  nodes: TreeNodeWithChildren[];
  activePath: string[];
}

export interface CompactResult {
  conversation: Conversation;
  nodes: TreeNode[];
  sourceConversationId: string;
}

export interface CreativeWorkspace {
  // Read-only conversation management
  listConversations(slug: string): Promise<Conversation[]>;
  getConversation(slug: string, id: string): Promise<Conversation | null>;
  loadConversationSnapshot(slug: string, id: string): Promise<ConversationSnapshot | null>;

  // Mutating conversation management
  createConversation(slug: string): Promise<CreatedConversation>;
  deleteConversation(slug: string, id: string): Promise<void>;
  deleteSubtree(
    slug: string,
    conversationId: string,
    nodeId: string,
  ): Promise<{ rootNodeId: string; activeLeafId: string; activePath: string[] }>;
  compactConversation(slug: string, sourceId: string): Promise<CompactResult>;

  // Session lifecycle
  openSession(slug: string, conversationId: string): Promise<CreativeSession>;
}

// --- Implementation ---

interface CacheEntry {
  session: CreativeSession;
  lastUsedAt: number;
}

const DEFAULT_CACHE_LIMIT = 20;
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;

export function createCreativeWorkspace(
  opts: CreativeWorkspaceOptions,
): CreativeWorkspace {
  const projectsDir = opts.projectsDir;
  const storage: SessionStorage = createSessionStorage(projectsDir);
  const sessions = new Map<string, CacheEntry>();
  const cacheLimit = opts.sessionCacheLimit ?? DEFAULT_CACHE_LIMIT;
  const idleTtlMs = opts.sessionIdleTtlMs ?? DEFAULT_IDLE_TTL_MS;

  function key(slug: string, id: string): string {
    return `${slug}::${id}`;
  }

  function projectDirOf(slug: string): string {
    return join(projectsDir, slug);
  }

  /** Drop any cache entry for the given key (no-op if absent). Disposes the session. */
  function evict(slug: string, id: string): void {
    const k = key(slug, id);
    const entry = sessions.get(k);
    if (!entry) return;
    if (entry.session.isBusy()) return; // never evict mid-prompt
    entry.session.dispose();
    sessions.delete(k);
  }

  /**
   * Cache hygiene — runs piggybacked on every openSession.
   *  1. Evict idle sessions past TTL (skip busy ones).
   *  2. If still over the limit, evict LRU (skip busy).
   */
  function cleanup(): void {
    const now = Date.now();
    if (idleTtlMs > 0) {
      for (const [k, entry] of sessions) {
        if (entry.session.isBusy()) continue;
        if (now - entry.lastUsedAt > idleTtlMs) {
          entry.session.dispose();
          sessions.delete(k);
        }
      }
    }
    while (sessions.size > cacheLimit) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [k, entry] of sessions) {
        if (entry.session.isBusy()) continue;
        if (entry.lastUsedAt < oldestAt) {
          oldestAt = entry.lastUsedAt;
          oldestKey = k;
        }
      }
      if (!oldestKey) break; // every cached session is busy — leave them alone
      const entry = sessions.get(oldestKey)!;
      entry.session.dispose();
      sessions.delete(oldestKey);
    }
  }

  return {
    // --- Read-only ---

    async listConversations(slug: string): Promise<Conversation[]> {
      return storage.listConversations(slug);
    },

    async getConversation(slug: string, id: string): Promise<Conversation | null> {
      return storage.getConversation(slug, id);
    },

    async loadConversationSnapshot(
      slug: string,
      id: string,
    ): Promise<ConversationSnapshot | null> {
      const loaded = await storage.loadConversationWithTree(slug, id);
      if (!loaded) return null;
      return snapshotFromLoaded(loaded);
    },

    // --- Create / delete ---

    async createConversation(slug: string): Promise<CreatedConversation> {
      const cfg = opts.resolveAgentConfig();
      const conv = await storage.createConversation(slug, cfg.provider, cfg.model);
      const projectDir = projectDirOf(slug);
      const skills = await discoverProjectSkills(join(projectDir, "skills"));
      const autoNode = buildAlwaysActiveSeedNode(projectDir, skills, null);
      if (autoNode) {
        await storage.appendNode(slug, conv.id, autoNode);
        return {
          conversation: { ...conv, rootNodeId: autoNode.id, activeLeafId: autoNode.id },
          nodes: [autoNode],
        };
      }
      // Preserve current behavior: empty rootNodeId/activeLeafId when no seed.
      return { conversation: conv, nodes: [] };
    },

    async deleteConversation(slug: string, id: string): Promise<void> {
      evict(slug, id);
      // Belt-and-suspenders: even if no session was cached, the orchestrator
      // may still hold a stale SkillManager from a previous turn.
      clearSkillManager(id);
      await storage.deleteConversation(slug, id);
    },

    async deleteSubtree(
      slug: string,
      conversationId: string,
      nodeId: string,
    ): Promise<{ rootNodeId: string; activeLeafId: string; activePath: string[] }> {
      // Cached tree becomes stale after the rewrite — evict and let the
      // next openSession reload fresh.
      evict(slug, conversationId);
      return storage.deleteSubtree(slug, conversationId, nodeId);
    },

    async compactConversation(
      slug: string,
      sourceId: string,
    ): Promise<CompactResult> {
      const loaded = await storage.loadConversationWithTree(slug, sourceId);
      if (!loaded) throw new Error("Conversation not found");
      if (loaded.activePath.length === 0) {
        throw new Error("Conversation is empty");
      }

      const cfg = opts.resolveAgentConfig();
      if (!cfg.apiKey && !cfg.baseUrl) {
        throw new Error(`API key not configured for provider: ${cfg.provider}`);
      }

      const history = flattenPathToMessages(loaded.tree, loaded.activePath);
      const piMessages = storedToPiMessages(history);
      const result = await fullCompact({
        messages: piMessages,
        model: resolveModel(
          cfg.provider,
          cfg.model,
          cfg.baseUrl && cfg.apiFormat
            ? { baseUrl: cfg.baseUrl, apiFormat: cfg.apiFormat }
            : undefined,
        ),
        apiKey: cfg.apiKey,
      });

      const summaryText = `This session continues from a previous conversation. Below is the context summary.\n\n${result.summary}`;
      const newConv = await storage.createConversation(
        slug,
        cfg.provider,
        cfg.model,
        sourceId,
      );

      const userNode: TreeNode = {
        id: nanoid(12),
        parentId: null,
        role: "user",
        content: [{ type: "text", text: summaryText }],
        createdAt: Date.now(),
        meta: "compact-summary",
      };
      const assistantNode: TreeNode = {
        id: nanoid(12),
        parentId: userNode.id,
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Understood. I have the full context from the previous conversation and I'm ready to continue. What would you like to work on next?",
          },
        ],
        createdAt: Date.now(),
        provider: cfg.provider,
        model: cfg.model,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          ...(result.cost ? { cost: result.cost } : {}),
        },
        meta: "compact-summary",
      };
      await storage.appendNode(slug, newConv.id, userNode);
      await storage.appendNode(slug, newConv.id, assistantNode);

      // Seed always-active skills as a child of the ack assistant node so
      // the order is `summary → ack → seed → first real prompt` — freshest
      // context last for LLM attention.
      const projectDir = projectDirOf(slug);
      const skills = await discoverProjectSkills(join(projectDir, "skills"));
      const autoNode = buildAlwaysActiveSeedNode(projectDir, skills, assistantNode.id);
      if (autoNode) {
        await storage.appendNode(slug, newConv.id, autoNode);
      }

      const nodes: TreeNode[] = autoNode
        ? [userNode, assistantNode, autoNode]
        : [userNode, assistantNode];
      const activeLeafId = (autoNode ?? assistantNode).id;

      return {
        conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId },
        nodes,
        sourceConversationId: sourceId,
      };
    },

    // --- Session lifecycle ---

    async openSession(
      slug: string,
      conversationId: string,
    ): Promise<CreativeSession> {
      cleanup();
      const k = key(slug, conversationId);
      const cached = sessions.get(k);
      if (cached) {
        cached.lastUsedAt = Date.now();
        return cached.session;
      }

      const loaded = await storage.loadConversationWithTree(slug, conversationId);
      if (!loaded) {
        throw new Error(`Conversation not found: ${slug}/${conversationId}`);
      }

      const session = new CreativeSession({
        projectSlug: slug,
        conversationId,
        projectDir: projectDirOf(slug),
        storage,
        tree: loaded.tree,
        resolveAgentConfig: opts.resolveAgentConfig,
      });

      sessions.set(k, { session, lastUsedAt: Date.now() });
      return session;
    },
  };
}

function snapshotFromLoaded(loaded: LoadedConversation): ConversationSnapshot {
  return {
    conversation: loaded.conversation,
    nodes: [...loaded.tree.values()].map(({ children, ...node }) => ({
      ...node,
      children,
    })),
    activePath: loaded.activePath,
  };
}
