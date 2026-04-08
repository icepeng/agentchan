import { nanoid } from "nanoid";
import { join } from "node:path";
import type { TreeNode } from "../types.js";
import {
  buildSkillContent,
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

export function createConversationService(
  conversationRepo: ConversationRepo,
  configService: ConfigService,
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
      return conversationRepo.createConversation(slug, config.provider, config.model);
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

      // Re-inject always-active skill bodies so the new conversation keeps the
      // same persona/world as the previous one. Other skills (model-invoked via
      // activate_skill, user-invoked via slash command) are NOT re-injected —
      // the catalog survives in the new conversation's system prompt, so the
      // model or user can re-activate them on demand if still needed.
      //
      // This is the compact-side counterpart to maybeAutoInvokeAlwaysActive in
      // agent.service.ts: that one runs at session start (parentNodeId === null),
      // this one runs after compact since the new conversation is seeded with a
      // summary user node, so the auto-invoke path won't fire there.
      //
      // fullCompact (LLM call) and discoverProjectSkills (fs scan) are
      // independent — run them in parallel so skill discovery overlaps with the
      // long-running summarization.
      const projectDir = join(projectsDir, slug);
      const [result, skillsMap] = await Promise.all([
        fullCompact({
          messages: piMessages,
          model: resolveModel(config.provider, config.model,
            compactProvider?.custom ? { baseUrl: compactProvider.custom.url, apiFormat: compactProvider.custom.format } : undefined,
          ),
          apiKey: apiKey ?? "",
        }),
        discoverProjectSkills(join(projectDir, "skills")),
      ]);
      const alwaysActiveBodies = [...skillsMap.values()]
        .filter((s) => s.meta.alwaysActive)
        .map((s) => buildSkillContent(s, projectDir, ""));
      const skillSection = alwaysActiveBodies.length > 0
        ? "\n\nThe following always-active skills are re-injected for continuity:\n\n" + alwaysActiveBodies.join("\n\n")
        : "";

      const summaryText = `This session continues from a previous conversation. Below is the context summary.\n\n${result.summary}${skillSection}`;
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

      return {
        conversation: { ...newConv, rootNodeId: userNode.id, activeLeafId: assistantNode.id },
        nodes: [userNode, assistantNode],
        sourceConversationId: conversationId,
      };
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
