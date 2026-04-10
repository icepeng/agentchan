import { join } from "node:path";
import { nanoid } from "nanoid";
import type {
  Message,
  AssistantMessage,
} from "@mariozechner/pi-ai";
import type { AgentEvent } from "@mariozechner/pi-agent-core";

import type {
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
} from "../types.js";
import {
  pathToNode,
  flattenPathToMessages,
} from "../conversation/tree.js";
import { setupCreativeAgent } from "./orchestrator.js";
import { piToStoredMessages, extractUsage } from "./convert.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import * as log from "../logger.js";
import { type AgentContext, projectDirOf } from "./context.js";
import type { ResolvedAgentConfig } from "./config.js";
import {
  buildUserNodeForPrompt,
  joinUserNodeText,
} from "./build.js";
import { summarizeTurnUsage } from "./usage.js";

// --- Public types ---

export type SessionEvent =
  | { type: "user_node"; node: TreeNode }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "assistant_nodes"; nodes: TreeNode[] }
  | { type: "usage_summary"; usage: TokenUsage }
  | { type: "error"; message: string }
  | { type: "done" };

export type Emit = (ev: SessionEvent) => void;

export interface PromptInput {
  slug: string;
  conversationId: string;
  parentNodeId: string | null;
  text: string;
}

export interface RegenerateInput {
  slug: string;
  conversationId: string;
  userNodeId: string;
}

// --- Public entry points ---

export function runPrompt(
  ctx: AgentContext,
  input: PromptInput,
  emit: Emit,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const tree = await loadFreshTree(ctx, input.slug, input.conversationId);
    const skills = await discoverProjectSkills(join(projectDir, "skills"));

    const { nodes: userNodes, llmText } = buildUserNodeForPrompt(
      input.text,
      projectDir,
      skills,
      input.parentNodeId,
    );

    for (const node of userNodes) {
      await persistAndInsertNode(ctx, input.slug, input.conversationId, tree, node);
      emit({ type: "user_node", node });
    }

    // History anchor = the last node we just persisted. convert.ts merges
    // consecutive user messages, so a slash-skill chip+text pair collapses
    // into one user turn for the LLM.
    const last = userNodes[userNodes.length - 1];
    await runAgentTurn({
      ctx,
      slug: input.slug,
      conversationId: input.conversationId,
      projectDir,
      tree,
      promptParentId: last.id,
      historyAnchorId: last.parentId,
      llmText,
      emit,
    });
  });
}

export function runRegenerate(
  ctx: AgentContext,
  input: RegenerateInput,
  emit: Emit,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const tree = await loadFreshTree(ctx, input.slug, input.conversationId);

    const userNode = tree.get(input.userNodeId);
    if (!userNode) {
      emit({ type: "error", message: "User node not found" });
      return;
    }
    const userText = joinUserNodeText(userNode.content);
    if (!userText) {
      emit({ type: "error", message: "No text content in user node" });
      return;
    }

    await runAgentTurn({
      ctx,
      slug: input.slug,
      conversationId: input.conversationId,
      projectDir,
      tree,
      promptParentId: input.userNodeId,
      historyAnchorId: userNode.parentId,
      llmText: userText,
      emit,
    });
  });
}

// --- Internals ---

/**
 * Catch any thrown error into an `error` event and always emit `done` so SSE
 * consumers can close the stream cleanly.
 */
async function runWithEnvelope(emit: Emit, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    emit({ type: "done" });
  }
}

async function loadFreshTree(
  ctx: AgentContext,
  slug: string,
  conversationId: string,
): Promise<Map<string, TreeNodeWithChildren>> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, conversationId);
  if (!loaded) {
    throw new Error(`Conversation not found: ${slug}/${conversationId}`);
  }
  return loaded.tree;
}

/**
 * Append a node to disk and patch the in-memory tree.
 *
 * The activeChildId update on the parent is intentionally in-memory only:
 * computeActivePath's "last child" fallback already picks the newest append
 * on reload, so persisting the pointer here would be redundant.
 */
async function persistAndInsertNode(
  ctx: AgentContext,
  slug: string,
  conversationId: string,
  tree: Map<string, TreeNodeWithChildren>,
  node: TreeNode,
): Promise<void> {
  await ctx.storage.appendNode(slug, conversationId, node);
  tree.set(node.id, { ...node, children: [] });
  if (node.parentId && tree.has(node.parentId)) {
    const parent = tree.get(node.parentId)!;
    parent.children.push(node.id);
    parent.activeChildId = node.id;
  }
}

interface AgentTurnArgs {
  ctx: AgentContext;
  slug: string;
  conversationId: string;
  projectDir: string;
  tree: Map<string, TreeNodeWithChildren>;
  promptParentId: string;
  historyAnchorId: string | null;
  llmText: string;
  emit: Emit;
}

async function runAgentTurn(args: AgentTurnArgs): Promise<void> {
  const { ctx, slug, conversationId, projectDir, tree, emit } = args;

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    emit({
      type: "error",
      message: `API key not configured for provider: ${cfg.provider}`,
    });
    return;
  }

  const historyPath = args.historyAnchorId
    ? pathToNode(tree, args.historyAnchorId)
    : [];
  const history = flattenPathToMessages(tree, historyPath);

  const { agent, historyLength } = await setupCreativeAgent(
    buildAgentOptions(cfg, projectDir),
    history,
    conversationId,
  );

  let lastNodeId = args.promptParentId;

  const usageEntries: TokenUsage[] = [];
  const unsubscribe = agent.subscribe((ev: AgentEvent) => {
    if (
      ev.type === "message_end" &&
      (ev.message as Message).role === "assistant"
    ) {
      usageEntries.push(extractUsage(ev.message as AssistantMessage));
    }
    emit({ type: "agent_event", event: ev });
  });

  try {
    await agent.prompt(args.llmText);
  } finally {
    unsubscribe();
  }

  const newMessages: Message[] = [];
  const all = agent.state.messages as Message[];
  for (let i = historyLength; i < all.length; i++) {
    const msg = all[i];
    // Drop the leading user prompt — already persisted before the agent ran.
    if (i === historyLength && msg.role === "user") continue;
    newMessages.push(msg);
  }

  const stored = piToStoredMessages(newMessages);

  const newNodes: TreeNode[] = [];
  for (const msg of stored) {
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

  const turnUsage = summarizeTurnUsage(usageEntries);
  if (turnUsage) {
    // Hang the rolled-up usage off the last assistant node so the frontend
    // can render context window utilization.
    for (let i = newNodes.length - 1; i >= 0; i--) {
      if (newNodes[i].role === "assistant") {
        newNodes[i].usage = turnUsage;
        break;
      }
    }
  }

  for (const node of newNodes) {
    await persistAndInsertNode(ctx, slug, conversationId, tree, node);
  }

  if (turnUsage) emit({ type: "usage_summary", usage: turnUsage });
  if (newNodes.length === 0) {
    emit({ type: "error", message: "No response from model" });
  } else {
    emit({ type: "assistant_nodes", nodes: newNodes });
  }
}

function buildAgentOptions(cfg: ResolvedAgentConfig, projectDir: string) {
  return {
    provider: cfg.provider,
    model: cfg.model,
    projectDir,
    apiKey: cfg.apiKey,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    contextWindow: cfg.contextWindow,
    thinkingLevel: cfg.thinkingLevel,
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    ...(cfg.apiFormat ? { apiFormat: cfg.apiFormat } : {}),
  };
}
