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
  discoverProjectSkills,
  parseSlashCommand,
  findSlashInvocableSkill,
  buildSkillContent,
  type AgentEvent,
  type AssistantMessage,
  type Message,
  type SkillRecord,
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
    skillsMap: Map<string, SkillRecord>,
  ) {
    const config = configService.getConfig();
    const projectDir = join(projectsDir, slug);

    const providerInfo = configService.findProvider(config.provider);
    const apiKey = configService.getApiKey(config.provider);
    // Custom providers (e.g. local Ollama) may not require an API key.
    if (!apiKey && !providerInfo?.custom) {
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
          apiKey: apiKey ?? "",
          temperature: config.temperature,
          maxTokens: config.maxTokens, contextWindow: config.contextWindow,
          thinkingLevel: config.thinkingLevel,
          skills: skillsMap,
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

  /**
   * If `text` matches a slash command for an invocable skill, expand it into the
   * skill body. Returns the expanded text plus the original raw input as
   * `displayText` (so the UI can show "/skillname" while the model receives the
   * full body). Returns null if the text is not a recognized slash command.
   *
   * Always-active skills are intentionally not matched: they are auto-invoked
   * once at session start by maybeAutoInvokeAlwaysActive, so a manual slash
   * would just duplicate the body. Unknown skills also return null, in which
   * case the text is sent as-is (the model sees the literal "/foo").
   */
  function tryExpandSlashCommand(
    projectDir: string,
    skillsMap: Map<string, SkillRecord>,
    text: string,
  ): { expanded: string; displayText: string } | null {
    const parsed = parseSlashCommand(text);
    if (!parsed) return null;

    const skill = findSlashInvocableSkill(skillsMap, parsed.name);
    if (!skill) return null;

    const expanded = buildSkillContent(skill, projectDir, parsed.args);
    return { expanded, displayText: text };
  }

  /**
   * On the first message of a conversation, inject every always-active skill's
   * body as a single user node so the model sees it as recent context (not as a
   * far-away system instruction). Returns the new parent id, or `parentNodeId`
   * unchanged if there was nothing to inject.
   *
   * Mirrors the slash invocation format (`<skill_content>` block via
   * buildSkillContent) so the LLM payload is identical to a manual
   * `/skillname` invocation. The displayText is a short label so the chat UI
   * doesn't render the full body.
   */
  async function maybeAutoInvokeAlwaysActive(
    stream: SSEStreamingApi,
    slug: string,
    conversationId: string,
    parentNodeId: string | null,
    projectDir: string,
    skillsMap: Map<string, SkillRecord>,
  ): Promise<string | null> {
    if (parentNodeId !== null) return parentNodeId;
    const alwaysActive = [...skillsMap.values()].filter((s) => s.meta.alwaysActive);
    if (alwaysActive.length === 0) return parentNodeId;

    const combined = alwaysActive
      .map((s) => buildSkillContent(s, projectDir, ""))
      .join("\n\n");
    const names = alwaysActive.map((s) => s.meta.name).join(", ");
    const autoNode: TreeNode = {
      id: nanoid(12),
      parentId: null,
      role: "user",
      content: [{ type: "text", text: combined, displayText: `[Auto-loaded: ${names}]` }],
      createdAt: Date.now(),
    };
    await conversationRepo.appendNode(slug, conversationId, autoNode);
    await stream.writeSSE({ event: "user_node", data: JSON.stringify(autoNode) });
    return autoNode.id;
  }

  return {
    async sendMessage(
      stream: SSEStreamingApi,
      slug: string,
      conversationId: string,
      parentNodeId: string | null,
      text: string,
    ) {
      const projectDir = join(projectsDir, slug);
      const skillsMap = await discoverProjectSkills(join(projectDir, "skills"));

      parentNodeId = await maybeAutoInvokeAlwaysActive(
        stream, slug, conversationId, parentNodeId, projectDir, skillsMap,
      );

      const expansion = tryExpandSlashCommand(projectDir, skillsMap, text);
      const llmText = expansion?.expanded ?? text;
      const textBlock: { type: "text"; text: string; displayText?: string } = expansion
        ? { type: "text", text: expansion.expanded, displayText: expansion.displayText }
        : { type: "text", text };

      const userNode: TreeNode = {
        id: nanoid(12), parentId: parentNodeId,
        role: "user", content: [textBlock], createdAt: Date.now(),
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
      await streamAgentAndPersist(
        stream, slug, conversationId, userNode.id, llmText, historyPath, tree, skillsMap,
      );
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

      const skillsMap = await discoverProjectSkills(join(projectsDir, slug, "skills"));
      const historyPath = userNode.parentId ? pathToNode(tree, userNode.parentId) : [];
      await streamAgentAndPersist(
        stream, slug, conversationId, userNodeId, userText, historyPath, tree, skillsMap,
      );
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
