import { nanoid } from "nanoid";
import { join } from "node:path";
import type { TreeNode } from "../types.js";
import {
  clearSkillManager,
  computeActivePath,
  flattenPathToMessages,
  switchBranch,
  storedToPiMessages,
  fullCompact,
  resolveModel,
  discoverProjectSkills,
} from "@agentchan/creative-agent";
import type { ConversationRepo } from "../repositories/conversation.repo.js";
import type { ConfigService } from "./config.service.js";
import type { SlashService } from "./slash.service.js";

export function createConversationService(
  conversationRepo: ConversationRepo,
  configService: ConfigService,
  slashService: SlashService,
  projectsDir: string,
) {
  return {
    async list(slug: string) {
      return conversationRepo.listConversations(slug);
    },

    async get(slug: string, id: string) {
      const result = await conversationRepo.loadConversationWithTree(slug, id);
      if (!result) return null;

      return {
        conversation: result.conversation,
        nodes: [...result.tree.values()].map(({ children, ...node }) => ({ ...node, children })),
        activePath: result.activePath,
      };
    },

    async getConversation(slug: string, id: string) {
      return conversationRepo.getConversation(slug, id);
    },

    async create(slug: string) {
      const config = configService.getConfig();
      const conv = await conversationRepo.createConversation(slug, config.provider, config.model);
      const projectDir = join(projectsDir, slug);
      const skills = await discoverProjectSkills(join(projectDir, "skills"));
      const autoNode = await slashService.seedAlwaysActiveSkills(
        slug, conv.id, null, projectDir, skills,
      );
      const seedId = autoNode?.id ?? "";
      return {
        conversation: { ...conv, rootNodeId: seedId, activeLeafId: seedId },
        nodes: autoNode ? [autoNode] : [],
      };
    },

    async delete(slug: string, id: string) {
      await conversationRepo.deleteConversation(slug, id);
      clearSkillManager(id);
    },

    async deleteSubtree(slug: string, conversationId: string, nodeId: string) {
      return conversationRepo.deleteSubtree(slug, conversationId, nodeId);
    },

    async switchBranch(slug: string, conversationId: string, nodeId: string) {
      const tree = await conversationRepo.loadTree(slug, conversationId);
      if (!tree.has(nodeId)) return null;

      const { updatedNodes, newLeafId } = switchBranch(tree, nodeId);
      if (updatedNodes.length > 0) {
        await conversationRepo.persistActiveChildUpdates(slug, conversationId, tree);
      }

      const rootNode = [...tree.values()].find((n) => !n.parentId);
      const activePath = rootNode ? computeActivePath(tree, rootNode.id) : [];
      return { activePath, activeLeafId: newLeafId };
    },

    async compact(slug: string, conversationId: string) {
      const loaded = await conversationRepo.loadConversationWithTree(slug, conversationId);
      if (!loaded) return null;
      if (loaded.activePath.length === 0) throw new Error("Conversation is empty");

      const history = flattenPathToMessages(loaded.tree, loaded.activePath);
      const piMessages = storedToPiMessages(history);

      const config = configService.getConfig();
      const compactProvider = configService.findProvider(config.provider);
      const apiKey = configService.getApiKey(config.provider);
      // Custom providers (e.g. local Ollama) may not require an API key.
      if (!apiKey && !compactProvider?.custom) {
        throw new Error(`API key not configured for provider: ${config.provider}`);
      }

      const result = await fullCompact({
        messages: piMessages,
        model: resolveModel(config.provider, config.model,
          compactProvider?.custom ? { baseUrl: compactProvider.custom.url, apiFormat: compactProvider.custom.format } : undefined,
        ),
        apiKey: apiKey ?? "",
      });

      const summaryText = `This session continues from a previous conversation. Below is the context summary.\n\n${result.summary}`;
      const newConv = await conversationRepo.createConversation(slug, config.provider, config.model, conversationId);

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
      await conversationRepo.appendNode(slug, newConv.id, userNode);
      await conversationRepo.appendNode(slug, newConv.id, assistantNode);

      // Seed always-active skills after the summary/ack pair so the order is
      // `summary user → ack assistant → skill-auto-load user → real user`.
      // "Freshest context last" matches the LLM attention pattern.
      const projectDir = join(projectsDir, slug);
      const skills = await discoverProjectSkills(join(projectDir, "skills"));
      const autoNode = await slashService.seedAlwaysActiveSkills(
        slug, newConv.id, assistantNode.id, projectDir, skills,
      );

      const nodes: TreeNode[] = autoNode
        ? [userNode, assistantNode, autoNode]
        : [userNode, assistantNode];
      const activeLeafId = (autoNode ?? assistantNode).id;

      return {
        conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId },
        nodes,
        sourceConversationId: conversationId,
      };
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
