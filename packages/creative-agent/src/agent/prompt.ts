import { join } from "node:path";
import { nanoid } from "nanoid";
import type {
  Message,
  AssistantMessage,
} from "@mariozechner/pi-ai";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";

import type {
  TokenUsage,
  TreeNode,
  TreeNodeWithChildren,
} from "../types.js";
import type { SessionMode } from "../conversation/format.js";
import {
  pathToNode,
  flattenPathToMessages,
} from "../conversation/tree.js";
import { setupCreativeAgent } from "./orchestrator.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { type AgentContext, projectDirOf } from "./context.js";
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

// --- Helpers ---

/** Extract usage stats from a completed AssistantMessage. */
function extractUsage(msg: AssistantMessage): TokenUsage {
  const usage = msg.usage;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    ...(usage.cacheRead ? { cachedInputTokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite ? { cacheCreationTokens: usage.cacheWrite } : {}),
    ...(usage.cost?.total ? { cost: usage.cost.total } : {}),
  };
}

// --- Public entry points ---

export function runPrompt(
  ctx: AgentContext,
  input: PromptInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const { tree, mode } = await loadFreshTree(ctx, input.slug, input.conversationId);
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

    // History anchor = the last node we just persisted.
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
      sessionMode: mode,
      signal,
    });
  });
}

export function runRegenerate(
  ctx: AgentContext,
  input: RegenerateInput,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  return runWithEnvelope(emit, async () => {
    const projectDir = projectDirOf(ctx, input.slug);
    const { tree, mode } = await loadFreshTree(ctx, input.slug, input.conversationId);

    const userNode = tree.get(input.userNodeId);
    if (!userNode) {
      emit({ type: "error", message: "User node not found" });
      return;
    }
    const userText = joinUserNodeText(userNode.message);
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
      sessionMode: mode,
      signal,
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
): Promise<{ tree: Map<string, TreeNodeWithChildren>; mode: SessionMode | undefined }> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, conversationId);
  if (!loaded) {
    throw new Error(`Conversation not found: ${slug}/${conversationId}`);
  }
  return { tree: loaded.tree, mode: loaded.conversation.mode };
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
  sessionMode?: SessionMode;
  signal?: AbortSignal;
}

async function runAgentTurn(args: AgentTurnArgs): Promise<void> {
  const { ctx, slug, conversationId, projectDir, tree, emit, signal } = args;

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    emit({
      type: "error",
      message: `API key not configured for provider: ${cfg.provider}`,
    });
    return;
  }

  // If the caller already aborted (e.g. client disconnected between tree load
  // and agent setup), bail before spending tokens.
  if (signal?.aborted) return;

  const historyPath = args.historyAnchorId
    ? pathToNode(tree, args.historyAnchorId)
    : [];
  const history = flattenPathToMessages(tree, historyPath);

  const { agent, historyLength } = await setupCreativeAgent(
    cfg,
    projectDir,
    history,
    conversationId,
    args.sessionMode,
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

  // Bridge external AbortSignal → pi-agent-core Agent.abort().
  // pi-agent-core manages its own AbortController internally; the only lever
  // we have is calling agent.abort() which cancels the in-flight LLM request.
  const onAbort = () => agent.abort();
  if (signal) {
    if (signal.aborted) {
      // Already aborted before agent.prompt() started.
      unsubscribe();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    await agent.prompt(args.llmText);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }

  // Extract new messages from the agent (skip the echo'd user prompt)
  const newMessages: AgentMessage[] = [];
  const all = agent.state.messages;
  for (let i = historyLength; i < all.length; i++) {
    const msg = all[i];
    // Drop the leading user prompt — already persisted before the agent ran.
    if (i === historyLength && msg.role === "user") continue;
    newMessages.push(msg);
  }

  // Wrap each pi-ai Message directly as a TreeNode — no conversion needed
  const newNodes: TreeNode[] = [];
  for (const msg of newMessages) {
    const node: TreeNode = {
      id: nanoid(12),
      parentId: lastNodeId,
      message: msg,
      createdAt: Date.now(),
    };
    newNodes.push(node);
    lastNodeId = node.id;
  }

  const turnUsage = summarizeTurnUsage(usageEntries);
  if (turnUsage) {
    // Hang the rolled-up usage off the last assistant node so the frontend
    // can render context window utilization.
    for (let i = newNodes.length - 1; i >= 0; i--) {
      if (newNodes[i].message.role === "assistant") {
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
