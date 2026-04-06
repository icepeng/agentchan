import { nanoid } from "nanoid";
import { join } from "node:path";
import type { SSEStreamingApi } from "hono/streaming";
import type { TreeNode, TokenUsage } from "../types.js";
import {
  setupCreativeAgent,
  piToStoredMessages,
  extractUsage,
  flattenPathToMessages,
  pathToNode,
  type AgentEvent,
  type AssistantMessage,
  type Message,
  type ToolCall,
} from "@agentchan/creative-agent";
import type { ConversationRepo } from "../repositories/conversation.repo.js";
import type { ConfigService } from "./config.service.js";

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

export function createAgentService(
  configService: ConfigService,
  conversationRepo: ConversationRepo,
  projectsDir: string,
) {
  async function streamAgentAndPersist(
    stream: SSEStreamingApi,
    slug: string,
    conversationId: string,
    parentNodeId: string,
    userText: string,
    historyPath: string[],
    tree: Map<string, any>,
  ) {
    const config = configService.getConfig();
    const projectDir = join(projectsDir, slug);

    const apiKey = configService.getApiKey(config.provider);
    if (!apiKey) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: `API key not configured for provider: ${config.provider}` }),
      });
      await stream.writeSSE({ event: "done", data: "" });
      return;
    }

    try {
      const { agent, historyLength } = await setupCreativeAgent(
        {
          provider: config.provider, model: config.model, projectDir,
          apiKey,
          temperature: config.temperature,
          maxTokens: config.maxTokens, contextWindow: config.contextWindow,
          thinkingLevel: config.thinkingLevel,
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
      // The first message is the user prompt, already persisted by the caller — skip it.
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
      for (const node of newNodes) await conversationRepo.appendNode(slug, conversationId, node);

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

  return {
    async sendMessage(
      stream: SSEStreamingApi,
      slug: string,
      conversationId: string,
      parentNodeId: string | null,
      text: string,
    ) {
      const userNode: TreeNode = {
        id: nanoid(12), parentId: parentNodeId,
        role: "user", content: [{ type: "text", text }], createdAt: Date.now(),
      };
      await conversationRepo.appendNode(slug, conversationId, userNode);

      const tree = await conversationRepo.loadTree(slug, conversationId);
      tree.set(userNode.id, { ...userNode, children: [] });
      if (parentNodeId && tree.has(parentNodeId)) {
        tree.get(parentNodeId)!.children.push(userNode.id);
        tree.get(parentNodeId)!.activeChildId = userNode.id;
      }

      const historyPath = parentNodeId ? pathToNode(tree, parentNodeId) : [];

      await stream.writeSSE({ event: "user_node", data: JSON.stringify(userNode) });
      await streamAgentAndPersist(stream, slug, conversationId, userNode.id, text, historyPath, tree);
    },

    async regenerate(
      stream: SSEStreamingApi,
      slug: string,
      conversationId: string,
      userNodeId: string,
    ) {
      const tree = await conversationRepo.loadTree(slug, conversationId);
      const userNode = tree.get(userNodeId);
      if (!userNode) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "User node not found" }) });
        await stream.writeSSE({ event: "done", data: "" });
        return;
      }

      const textBlock = userNode.content.find((b: any) => b.type === "text");
      const userText = textBlock && "text" in textBlock ? textBlock.text : "";
      if (!userText) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "No text content in user node" }) });
        await stream.writeSSE({ event: "done", data: "" });
        return;
      }

      const historyPath = userNode.parentId ? pathToNode(tree, userNode.parentId) : [];
      await streamAgentAndPersist(stream, slug, conversationId, userNodeId, userText, historyPath, tree);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
