/**
 * Conversation operations that touch the LLM or seed agent state.
 *
 * - createConversation: storage create + always-active skill seed node
 * - deleteConversation: storage delete + per-conversation agent state cleanup
 * - compactConversation: LLM-based summarization, persisted as a fresh conversation
 */

import { join } from "node:path";
import { nanoid } from "nanoid";

import type { Conversation, TreeNode } from "../types.js";
import { flattenPathToMessages } from "../conversation/tree.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import type { SkillRecord } from "../skills/types.js";
import { fullCompact } from "./compact.js";
import { storedToPiMessages } from "./convert.js";
import { resolveModel, clearConversationAgentState } from "./orchestrator.js";
import { type AgentContext, projectDirOf } from "./context.js";
import { buildAlwaysActiveSeedNode, buildCatalogReminderNode } from "./build.js";

// --- Skill bootstrap helper ---

/**
 * Build (but do not persist) the catalog reminder + always-active seed pair
 * that every new conversation starts with, chained as parent→child from
 * `initialParentId`. Both ordering and channel colocation matter for the
 * Gemini regression this pair fixes — see `generateCatalog` for context.
 * Returns the nodes in persistence order; either may be absent.
 */
function buildSkillBootstrapNodes(
  projectDir: string,
  skills: Map<string, SkillRecord>,
  initialParentId: string | null,
): TreeNode[] {
  const catalog = buildCatalogReminderNode(skills, initialParentId);
  const seed = buildAlwaysActiveSeedNode(
    projectDir,
    skills,
    catalog?.id ?? initialParentId,
  );
  return [catalog, seed].filter((n): n is TreeNode => n !== null);
}

// --- Public types ---

export interface CreatedConversation {
  conversation: Conversation;
  /** Seed nodes (always-active skills) inserted at creation time. */
  nodes: TreeNode[];
}

export interface CompactResult {
  conversation: Conversation;
  nodes: TreeNode[];
  sourceConversationId: string;
}

// --- Create / delete ---

export async function createConversation(
  ctx: AgentContext,
  slug: string,
): Promise<CreatedConversation> {
  const cfg = ctx.resolveAgentConfig();
  const conv = await ctx.storage.createConversation(slug, cfg.provider, cfg.model);
  const projectDir = projectDirOf(ctx, slug);
  const skills = await discoverProjectSkills(join(projectDir, "skills"));

  const nodes = buildSkillBootstrapNodes(projectDir, skills, null);
  if (nodes.length === 0) {
    return { conversation: conv, nodes: [] };
  }

  await ctx.storage.appendNodes(slug, conv.id, nodes);
  return {
    conversation: {
      ...conv,
      rootNodeId: nodes[0].id,
      activeLeafId: nodes[nodes.length - 1].id,
    },
    nodes,
  };
}

export async function deleteConversation(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  // Releases the per-conversation Google explicit cache entry — leaks if
  // skipped on Gemini cache-enabled runs.
  clearConversationAgentState(id);
  await ctx.storage.deleteConversation(slug, id);
}

// --- Compact ---

export async function compactConversation(
  ctx: AgentContext,
  slug: string,
  sourceId: string,
): Promise<CompactResult> {
  const loaded = await ctx.storage.loadConversationWithTree(slug, sourceId);
  if (!loaded) throw new Error("Conversation not found");
  if (loaded.activePath.length === 0) {
    throw new Error("Conversation is empty");
  }

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  // Kick off skill discovery in parallel with the (blocking, multi-second)
  // LLM summary call — both only depend on projectDir, so the file reads
  // can overlap the network round-trip.
  const projectDir = projectDirOf(ctx, slug);
  const skillsPromise = discoverProjectSkills(join(projectDir, "skills"));

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
  const newConv = await ctx.storage.createConversation(
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

  // Order: summary → ack → catalog reminder → seed → first real prompt.
  // Freshest context last for LLM attention.
  const skills = await skillsPromise;
  const trailing = buildSkillBootstrapNodes(projectDir, skills, assistantNode.id);
  const nodes: TreeNode[] = [userNode, assistantNode, ...trailing];
  await ctx.storage.appendNodes(slug, newConv.id, nodes);

  const activeLeafId = (trailing.at(-1) ?? assistantNode).id;

  return {
    conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId },
    nodes,
    sourceConversationId: sourceId,
  };
}
