import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { join } from "node:path";
import type { TreeNode, TokenUsage } from "../types.js";
import {
  setupCreativeAgent,
  clearSkillManager,
  piToStoredMessages,
  extractUsage,
  computeActivePath,
  flattenPathToMessages,
  pathToNode,
  switchBranch,
  storedToPiMessages,
  fullCompact,
  resolveModel,
  discoverProjectSkills,
  type AgentEvent,
  type AssistantMessage,
  type Message,
  type ToolCall,
} from "@agentchan/creative-agent";
import { sessionStorage } from "../services/storage.js";
import { getConfig, findProvider } from "./config.js";
import { getApiKey } from "../services/settings-db.js";
import { PROJECTS_DIR } from "../paths.js";

const app = new Hono();

function getSlug(c: any): string {
  return c.req.param("slug");
}

// List conversations
app.get("/", async (c) => {
  const slug = getSlug(c);
  return c.json(await sessionStorage.listConversations(slug));
});

// Create conversation
app.post("/", async (c) => {
  const slug = getSlug(c);
  const config = getConfig();
  return c.json(await sessionStorage.createConversation(slug, config.provider, config.model), 201);
});

// Load conversation tree
app.get("/:id", async (c) => {
  const slug = getSlug(c);
  const id = c.req.param("id");
  const result = await sessionStorage.loadConversationWithTree(slug, id);
  if (!result) return c.json({ error: "Conversation not found" }, 404);

  return c.json({
    conversation: result.conversation,
    nodes: [...result.tree.values()].map(({ children, ...node }) => ({ ...node, children })),
    activePath: result.activePath,
  });
});

// Delete conversation
app.delete("/:id", async (c) => {
  const slug = getSlug(c);
  const id = c.req.param("id");
  await sessionStorage.deleteConversation(slug, id);
  clearSkillManager(id);
  return c.json({ ok: true });
});

// Delete node (and all descendants)
app.delete("/:id/nodes/:nodeId", async (c) => {
  const slug = getSlug(c);
  const conversationId = c.req.param("id");
  const nodeId = c.req.param("nodeId");

  try {
    const result = await sessionStorage.deleteSubtree(slug, conversationId, nodeId);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
  }
});

// --- Agent streaming → SSE ---

/**
 * Map a pi-agent-core AgentEvent directly to an SSE frame.
 * Returns null for events that don't need to be forwarded to the client.
 */
function agentEventToSSE(event: AgentEvent): { event: string; data: string } | null {
  switch (event.type) {
    case "message_update": {
      const sub = event.assistantMessageEvent;
      switch (sub.type) {
        case "text_delta":
          return { event: "text_delta", data: JSON.stringify({ text: sub.delta }) };
        case "thinking_delta":
          return { event: "thinking_delta", data: JSON.stringify({ text: sub.delta }) };
        case "toolcall_start": {
          const tc = sub.partial.content[sub.contentIndex] as ToolCall;
          return { event: "tool_use_start", data: JSON.stringify({ id: tc?.id ?? "", name: tc?.name ?? "" }) };
        }
        case "toolcall_delta": {
          const tc = sub.partial.content[sub.contentIndex] as ToolCall;
          return { event: "tool_use_delta", data: JSON.stringify({ id: tc?.id ?? "", input_json: sub.delta }) };
        }
        case "toolcall_end":
          return { event: "tool_use_end", data: JSON.stringify({ id: sub.toolCall.id }) };
        default:
          return null;
      }
    }
    case "tool_execution_start":
      return { event: "tool_exec_start", data: JSON.stringify({ id: event.toolCallId, name: event.toolName, parallel: false }) };
    case "tool_execution_end":
      return { event: "tool_exec_end", data: JSON.stringify({ id: event.toolCallId, is_error: event.isError }) };
    default:
      return null;
  }
}

async function streamAgentAndPersist(
  stream: any,
  slug: string,
  conversationId: string,
  parentNodeId: string,
  userText: string,
  historyPath: string[],
  tree: Map<string, any>,
) {
  const config = getConfig();
  const projectDir = join(PROJECTS_DIR, slug);

  const apiKey = getApiKey(config.provider);
  if (!apiKey) {
    await stream.writeSSE({
      event: "error",
      data: JSON.stringify({ message: `API key not configured for provider: ${config.provider}` }),
    });
    await stream.writeSSE({ event: "done", data: "" });
    return;
  }

  try {
    const providerInfo = findProvider(config.provider);
    const { agent, historyLength } = await setupCreativeAgent(
      {
        provider: config.provider, model: config.model, projectDir,
        apiKey,
        temperature: config.temperature,
        maxTokens: config.maxTokens, contextWindow: config.contextWindow,
        thinkingLevel: config.thinkingLevel,
        ...(providerInfo?.custom && { baseUrl: providerInfo.custom.url, apiFormat: providerInfo.custom.format }),
      },
      flattenPathToMessages(tree, historyPath),
      conversationId,
    );

    // Usage accumulator (totals across all API calls in this turn)
    let totalInput = 0, totalOutput = 0, totalCachedInput = 0, totalCacheCreation = 0, totalCost = 0;
    // Last API call usage (overwritten each time — for context window utilization)
    let lastInput = 0, lastOutput = 0, lastCachedInput = 0, lastCacheCreation = 0;

    // Sync subscribe → async SSE queue
    const pending: { event: string; data: string }[] = [];
    let notify: (() => void) | null = null;
    let agentDone = false;

    const unsubscribe = agent.subscribe((ev: AgentEvent) => {
      // Accumulate usage from completed assistant messages
      if (ev.type === "message_end" && (ev.message as Message).role === "assistant") {
        const u = extractUsage(ev.message as AssistantMessage);
        totalInput += u.inputTokens;
        totalOutput += u.outputTokens;
        totalCachedInput += u.cachedInputTokens ?? 0;
        totalCacheCreation += u.cacheCreationTokens ?? 0;
        totalCost += u.cost ?? 0;
        lastInput = u.inputTokens;
        lastOutput = u.outputTokens;
        lastCachedInput = u.cachedInputTokens ?? 0;
        lastCacheCreation = u.cacheCreationTokens ?? 0;
      }

      const sse = agentEventToSSE(ev);
      if (sse) {
        pending.push(sse);
        notify?.();
        notify = null;
      }
    });

    // Start agent in background
    const promptDone = agent.prompt(userText).finally(() => {
      agentDone = true;
      unsubscribe();
      notify?.();
      notify = null;
    });

    // Drain SSE queue while agent runs
    while (!agentDone || pending.length > 0) {
      while (pending.length > 0) await stream.writeSSE(pending.shift()!);
      if (!agentDone) await new Promise<void>((r) => { notify = r; });
    }
    await promptDone;

    // --- Agent finished: persist and send final events ---

    const storedNewAll = piToStoredMessages((agent.state.messages as Message[]).slice(historyLength));
    // The first message is the user prompt, already persisted by the route handler — skip it.
    const storedNew = storedNewAll[0]?.role === "user" ? storedNewAll.slice(1) : storedNewAll;

    // Convert to TreeNodes
    const newNodes: TreeNode[] = [];
    let lastNodeId = parentNodeId;
    for (const msg of storedNew) {
      const node: TreeNode = {
        id: nanoid(12), parentId: lastNodeId,
        role: msg.role, content: msg.content, createdAt: Date.now(),
        ...(msg.role === "assistant" ? { provider: config.provider, model: config.model } : {}),
      };
      newNodes.push(node);
      lastNodeId = node.id;
    }

    // Context tokens = last API call's total window usage
    const contextTokens = lastInput + lastOutput + lastCachedInput + lastCacheCreation;

    // Build usage object and attach to last assistant node
    let turnUsage: TokenUsage | undefined;
    if (totalInput > 0 || totalOutput > 0) {
      turnUsage = { inputTokens: totalInput, outputTokens: totalOutput };
      if (totalCachedInput) turnUsage.cachedInputTokens = totalCachedInput;
      if (totalCacheCreation) turnUsage.cacheCreationTokens = totalCacheCreation;
      if (totalCost) turnUsage.cost = totalCost;
      if (contextTokens > 0) turnUsage.contextTokens = contextTokens;

      const lastAssistant = [...newNodes].reverse().find((n) => n.role === "assistant");
      if (lastAssistant) lastAssistant.usage = turnUsage;
    }

    // Persist
    for (const node of newNodes) await sessionStorage.appendNode(slug, conversationId, node);

    // Send final SSE events
    if (turnUsage) {
      await stream.writeSSE({
        event: "usage_summary",
        data: JSON.stringify(turnUsage),
      });
    }
    if (newNodes.length === 0) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "No response from model" }),
      });
    } else {
      await stream.writeSSE({ event: "assistant_nodes", data: JSON.stringify(newNodes) });
    }

  } catch (error) {
    await stream.writeSSE({
      event: "error",
      data: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
    });
  }

  await stream.writeSSE({ event: "done", data: "" });
}

// Send message (SSE stream)
app.post("/:id/messages", async (c) => {
  const slug = getSlug(c);
  const conversationId = c.req.param("id");
  const { parentNodeId, text } =
    await c.req.json<{ parentNodeId: string | null; text: string }>();

  const conv = await sessionStorage.getConversation(slug, conversationId);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const userNode: TreeNode = {
    id: nanoid(12), parentId: parentNodeId,
    role: "user", content: [{ type: "text", text }], createdAt: Date.now(),
  };
  await sessionStorage.appendNode(slug, conversationId, userNode);

  const tree = await sessionStorage.loadTree(slug, conversationId);
  tree.set(userNode.id, { ...userNode, children: [] });
  if (parentNodeId && tree.has(parentNodeId)) {
    tree.get(parentNodeId)!.children.push(userNode.id);
    tree.get(parentNodeId)!.activeChildId = userNode.id;
  }

  const historyPath = parentNodeId ? pathToNode(tree, parentNodeId) : [];

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "user_node", data: JSON.stringify(userNode) });
    await streamAgentAndPersist(stream, slug, conversationId, userNode.id, text, historyPath, tree);
  });
});

// Regenerate response (SSE stream)
app.post("/:id/regenerate", async (c) => {
  const slug = getSlug(c);
  const conversationId = c.req.param("id");
  const { userNodeId } =
    await c.req.json<{ userNodeId: string }>();

  const tree = await sessionStorage.loadTree(slug, conversationId);
  const userNode = tree.get(userNodeId);
  if (!userNode) return c.json({ error: "User node not found" }, 404);

  const textBlock = userNode.content.find((b) => b.type === "text");
  const userText = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!userText) return c.json({ error: "No text content in user node" }, 400);

  const historyPath = userNode.parentId ? pathToNode(tree, userNode.parentId) : [];

  return streamSSE(c, async (stream) => {
    await streamAgentAndPersist(stream, slug, conversationId, userNodeId, userText, historyPath, tree);
  });
});

// Full compact — summarize and continue in new session
app.post("/:id/compact", async (c) => {
  const slug = getSlug(c);
  const conversationId = c.req.param("id");

  const loaded = await sessionStorage.loadConversationWithTree(slug, conversationId);
  if (!loaded) return c.json({ error: "Conversation not found" }, 404);
  if (loaded.activePath.length === 0) return c.json({ error: "Conversation is empty" }, 400);

  const history = flattenPathToMessages(loaded.tree, loaded.activePath);
  const piMessages = storedToPiMessages(history);

  const config = getConfig();
  const apiKey = getApiKey(config.provider);
  if (!apiKey) {
    return c.json({ error: `API key not configured for provider: ${config.provider}` }, 400);
  }

  let result;
  try {
    const compactProvider = findProvider(config.provider);
    result = await fullCompact({
      messages: piMessages,
      model: resolveModel(config.provider, config.model,
        compactProvider?.custom ? { baseUrl: compactProvider.custom.url, apiFormat: compactProvider.custom.format } : undefined,
      ),
      apiKey,
    });
  } catch (e) {
    return c.json({ error: `Compact failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  // Re-inject activated skill content for continuity
  const activatedSkills = new Set<string>();
  for (const msg of history) {
    if (msg.role !== "assistant") continue;
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.name === "activate_skill") {
        const name = block.input.name;
        if (typeof name === "string") activatedSkills.add(name);
      }
    }
  }

  let skillSection = "";
  if (activatedSkills.size > 0) {
    const skills = await discoverProjectSkills(join(PROJECTS_DIR, slug, "skills"));
    const parts: string[] = [];
    for (const name of activatedSkills) {
      const skill = skills.get(name);
      if (skill) parts.push(`<skill_content name="${name}">\n${skill.body}\n</skill_content>`);
    }
    if (parts.length > 0) {
      skillSection = "\n\nThe following skills were active in the previous session and are re-injected for continuity:\n\n" + parts.join("\n\n");
    }
  }

  const summaryText = `This session continues from a previous conversation. Below is the context summary.\n\n${result.summary}${skillSection}`;
  const newConv = await sessionStorage.createConversation(slug, config.provider, config.model, conversationId);

  const userNode: TreeNode = {
    id: nanoid(12), parentId: null,
    role: "user", content: [{ type: "text", text: summaryText }], createdAt: Date.now(),
    meta: "compact-summary",
  };
  const assistantNode: TreeNode = {
    id: nanoid(12), parentId: userNode.id,
    role: "assistant",
    content: [{ type: "text", text: "Understood. I have the full context from the previous conversation and I'm ready to continue. What would you like to work on next?" }],
    createdAt: Date.now(),
    provider: config.provider, model: config.model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, ...(result.cost ? { cost: result.cost } : {}) },
    meta: "compact-summary",
  };
  await sessionStorage.appendNode(slug, newConv.id, userNode);
  await sessionStorage.appendNode(slug, newConv.id, assistantNode);

  return c.json({
    conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId: assistantNode.id },
    nodes: [userNode, assistantNode],
    sourceConversationId: conversationId,
  });
});

// Switch branch
app.post("/:id/branch", async (c) => {
  const slug = getSlug(c);
  const conversationId = c.req.param("id");
  const { nodeId } = await c.req.json<{ nodeId: string }>();

  const tree = await sessionStorage.loadTree(slug, conversationId);
  if (!tree.has(nodeId)) return c.json({ error: "Node not found" }, 404);

  const { updatedNodes, newLeafId } = switchBranch(tree, nodeId);
  if (updatedNodes.length > 0) {
    await sessionStorage.persistActiveChildUpdates(slug, conversationId, tree);
  }

  const rootNode = [...tree.values()].find((n) => !n.parentId);
  const activePath = rootNode ? computeActivePath(tree, rootNode.id) : [];
  return c.json({ activePath, activeLeafId: newLeafId });
});

export default app;
