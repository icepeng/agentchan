/**
 * CreativeSession owns one conversation's runtime state — in-memory tree,
 * mutex-serialized turn execution, and event fan-out. Persistence is
 * delegated to the SessionStorage handed in by CreativeWorkspace.
 */

import { nanoid } from "nanoid";
import type { Message, AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentEvent } from "@mariozechner/pi-agent-core";

import type {
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
} from "../types.js";
import type { SessionStorage } from "../session/storage.js";
import {
  pathToNode,
  flattenPathToMessages,
  switchBranch as switchBranchInTree,
  computeActivePath,
} from "../session/tree.js";
import {
  setupCreativeAgent,
  clearSkillManager,
} from "../agent/orchestrator.js";
import { piToStoredMessages, extractUsage } from "../agent/convert.js";
import { buildUserNodeForPrompt, joinUserNodeText } from "./seed.js";
import { createMutex, type Mutex } from "./mutex.js";

// --- Public types ---

export interface ResolvedAgentConfig {
  provider: string;
  model: string;
  /** Empty string allowed for custom providers (e.g. local Ollama). */
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  baseUrl?: string;
  apiFormat?: string;
}

export type SessionEvent =
  | { type: "user_node"; node: TreeNode }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "assistant_nodes"; nodes: TreeNode[] }
  | { type: "usage_summary"; usage: TokenUsage }
  | { type: "error"; message: string }
  | { type: "done" };

export interface PromptOptions {
  parentNodeId: string | null;
}

export interface SwitchBranchResult {
  activePath: string[];
  activeLeafId: string;
}

export interface CreativeSessionInit {
  projectSlug: string;
  conversationId: string;
  projectDir: string;
  storage: SessionStorage;
  tree: Map<string, TreeNodeWithChildren>;
  resolveAgentConfig: () => ResolvedAgentConfig;
}

// --- Implementation ---

export class CreativeSession {
  readonly projectSlug: string;
  readonly conversationId: string;
  readonly projectDir: string;

  private storage: SessionStorage;
  private tree: Map<string, TreeNodeWithChildren>;
  private resolveConfig: () => ResolvedAgentConfig;

  private listeners = new Set<(ev: SessionEvent) => void>();
  private mutex: Mutex = createMutex();
  private disposed = false;

  constructor(init: CreativeSessionInit) {
    this.projectSlug = init.projectSlug;
    this.conversationId = init.conversationId;
    this.projectDir = init.projectDir;
    this.storage = init.storage;
    this.tree = init.tree;
    this.resolveConfig = init.resolveAgentConfig;
  }

  isBusy(): boolean {
    return this.mutex.isBusy();
  }

  // --- Subscription ---

  subscribe(handler: (ev: SessionEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private emit(ev: SessionEvent): void {
    for (const handler of this.listeners) {
      try {
        handler(ev);
      } catch (err) {
        // Listener errors must not break the agent loop.
        console.error("[creative-agent] session listener error", err);
      }
    }
  }

  // --- Mutating operations (mutex-serialized) ---

  prompt(rawText: string, opts: PromptOptions): Promise<void> {
    return this.runTurn(async () => {
      const { node: userNode, llmText } = await buildUserNodeForPrompt(
        rawText,
        this.projectDir,
        opts.parentNodeId,
      );
      await this.persistAndInsertNode(userNode);
      this.emit({ type: "user_node", node: userNode });

      await this.runAgentTurn(userNode.id, opts.parentNodeId, llmText);
    });
  }

  regenerate(userNodeId: string): Promise<void> {
    return this.runTurn(async () => {
      const userNode = this.tree.get(userNodeId);
      if (!userNode) {
        this.emit({ type: "error", message: "User node not found" });
        return;
      }
      const userText = joinUserNodeText(userNode.content);
      if (!userText) {
        this.emit({ type: "error", message: "No text content in user node" });
        return;
      }
      await this.runAgentTurn(userNodeId, userNode.parentId, userText);
    });
  }

  switchBranch(nodeId: string): Promise<SwitchBranchResult | null> {
    return this.mutex.run(async () => {
      this.assertNotDisposed();
      if (!this.tree.has(nodeId)) return null;

      const { updatedNodes, newLeafId } = switchBranchInTree(this.tree, nodeId);
      if (updatedNodes.length > 0) {
        await this.storage.persistActiveChildUpdates(
          this.projectSlug,
          this.conversationId,
          this.tree,
        );
      }

      const rootNode = [...this.tree.values()].find((n) => !n.parentId);
      const activePath = rootNode ? computeActivePath(this.tree, rootNode.id) : [];
      return { activePath, activeLeafId: newLeafId };
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    clearSkillManager(this.conversationId);
  }

  // --- Internals ---

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`CreativeSession ${this.conversationId} is disposed`);
    }
  }

  /**
   * Run one mutex-serialized turn: assert state, execute, translate failures
   * into `error` events, and always emit `done` so the SSE stream terminates.
   */
  private runTurn(fn: () => Promise<void>): Promise<void> {
    return this.mutex.run(async () => {
      this.assertNotDisposed();
      try {
        await fn();
      } catch (err) {
        this.emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.emit({ type: "done" });
      }
    });
  }

  /**
   * The activeChildId update on the parent is intentionally in-memory only —
   * computeActivePath's "last child" fallback already picks the newest append
   * on reload, so persisting the pointer is redundant.
   */
  private async persistAndInsertNode(node: TreeNode): Promise<void> {
    await this.storage.appendNode(this.projectSlug, this.conversationId, node);
    this.tree.set(node.id, { ...node, children: [] });
    if (node.parentId && this.tree.has(node.parentId)) {
      const parent = this.tree.get(node.parentId)!;
      parent.children.push(node.id);
      parent.activeChildId = node.id;
    }
  }

  /**
   * The shared "run one agent turn" pipeline used by both prompt() and
   * regenerate(). Assumes the caller has already persisted the user node
   * (or is reusing an existing one).
   */
  private async runAgentTurn(
    promptParentId: string,
    historyAnchorId: string | null,
    llmText: string,
  ): Promise<void> {
    const cfg = this.resolveConfig();
    // Custom providers (e.g. local Ollama) advertise themselves with baseUrl
    // and don't require an API key.
    if (!cfg.apiKey && !cfg.baseUrl) {
      this.emit({
        type: "error",
        message: `API key not configured for provider: ${cfg.provider}`,
      });
      return;
    }

    const historyPath = historyAnchorId
      ? pathToNode(this.tree, historyAnchorId)
      : [];
    const history = flattenPathToMessages(this.tree, historyPath);

    const { agent, historyLength } = await setupCreativeAgent(
      {
        provider: cfg.provider,
        model: cfg.model,
        projectDir: this.projectDir,
        apiKey: cfg.apiKey,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        contextWindow: cfg.contextWindow,
        thinkingLevel: cfg.thinkingLevel,
        ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
        ...(cfg.apiFormat ? { apiFormat: cfg.apiFormat } : {}),
      },
      history,
      this.conversationId,
    );

    const usage = createUsageAccumulator();

    const unsubscribe = agent.subscribe((ev: AgentEvent) => {
      if (
        ev.type === "message_end" &&
        (ev.message as Message).role === "assistant"
      ) {
        usage.feed(extractUsage(ev.message as AssistantMessage));
      }
      this.emit({ type: "agent_event", event: ev });
    });

    try {
      await agent.prompt(llmText);
    } finally {
      unsubscribe();
    }

    // Slice the new pi-ai messages off the agent's internal state and
    // convert. The first one is the user prompt we already persisted.
    const storedNewAll = piToStoredMessages(
      (agent.state.messages as Message[]).slice(historyLength),
    );
    const storedNew =
      storedNewAll[0]?.role === "user" ? storedNewAll.slice(1) : storedNewAll;

    const newNodes: TreeNode[] = [];
    let lastNodeId = promptParentId;
    for (const msg of storedNew) {
      const node: TreeNode = {
        id: nanoid(12),
        parentId: lastNodeId,
        role: msg.role,
        content: msg.content,
        createdAt: Date.now(),
        ...(msg.role === "assistant"
          ? { provider: cfg.provider, model: cfg.model }
          : {}),
      };
      newNodes.push(node);
      lastNodeId = node.id;
    }

    const turnUsage = usage.finalize();
    if (turnUsage) {
      // Hang the rolled-up usage off the last assistant node so the
      // frontend can render context window utilization.
      for (let i = newNodes.length - 1; i >= 0; i--) {
        if (newNodes[i].role === "assistant") {
          newNodes[i].usage = turnUsage;
          break;
        }
      }
    }

    for (const node of newNodes) {
      await this.persistAndInsertNode(node);
    }

    if (turnUsage) {
      this.emit({ type: "usage_summary", usage: turnUsage });
    }
    if (newNodes.length === 0) {
      this.emit({ type: "error", message: "No response from model" });
    } else {
      this.emit({ type: "assistant_nodes", nodes: newNodes });
    }
  }
}

// --- Helpers ---

interface UsageAccumulator {
  feed(u: TokenUsage): void;
  finalize(): TokenUsage | undefined;
}

/**
 * Tracks two parallel usage trackers across one turn:
 *   - total*: summed across every API call this turn (cost, billing)
 *   - last*:  the most recent API call only (used to derive contextTokens
 *             for the context-window utilization indicator in the UI)
 *
 * Collapsing them into one looks like a simplification but breaks the context
 * window display: totals over-count the window after multi-turn tool loops.
 */
function createUsageAccumulator(): UsageAccumulator {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCachedInput = 0;
  let totalCacheCreation = 0;
  let totalCost = 0;
  let lastInput = 0;
  let lastOutput = 0;
  let lastCachedInput = 0;
  let lastCacheCreation = 0;
  let any = false;

  return {
    feed(u: TokenUsage) {
      any = true;
      totalInput += u.inputTokens;
      totalOutput += u.outputTokens;
      totalCachedInput += u.cachedInputTokens ?? 0;
      totalCacheCreation += u.cacheCreationTokens ?? 0;
      totalCost += u.cost ?? 0;
      lastInput = u.inputTokens;
      lastOutput = u.outputTokens;
      lastCachedInput = u.cachedInputTokens ?? 0;
      lastCacheCreation = u.cacheCreationTokens ?? 0;
    },
    finalize(): TokenUsage | undefined {
      if (!any || (totalInput === 0 && totalOutput === 0)) return undefined;
      const usage: TokenUsage = {
        inputTokens: totalInput,
        outputTokens: totalOutput,
      };
      if (totalCachedInput) usage.cachedInputTokens = totalCachedInput;
      if (totalCacheCreation) usage.cacheCreationTokens = totalCacheCreation;
      if (totalCost) usage.cost = totalCost;
      const ctx = lastInput + lastOutput + lastCachedInput + lastCacheCreation;
      if (ctx > 0) usage.contextTokens = ctx;
      return usage;
    },
  };
}
