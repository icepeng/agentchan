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
  parseSlashCommand,
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

      const result = await fullCompact({
        messages: piMessages,
        model: resolveModel(config.provider, config.model,
          compactProvider?.custom ? { baseUrl: compactProvider.custom.url, apiFormat: compactProvider.custom.format } : undefined,
        ),
        apiKey: apiKey ?? "",
      });

      // Re-inject previously activated skill content for continuity.
      //
      // We track two activation channels:
      //   1. Model-invoked via the activate_skill tool (assistant tool_use blocks)
      //   2. User-invoked via slash command (user text blocks with displayText)
      //
      // Always-active skills are excluded — their body is automatically present
      // in the system prompt of the new session via generatePersistentSkillsBlock.
      const activatedSkills = new Set<string>();
      for (const msg of history) {
        if (msg.role === "assistant") {
          for (const block of msg.content) {
            if (block.type === "tool_use" && block.name === "activate_skill") {
              const name = block.input.name;
              if (typeof name === "string") activatedSkills.add(name);
            }
          }
        } else if (msg.role === "user") {
          for (const block of msg.content) {
            if (block.type !== "text") continue;
            if (!block.displayText) continue;
            const parsed = parseSlashCommand(block.displayText);
            if (parsed) activatedSkills.add(parsed.name);
          }
        }
      }

      let skillSection = "";
      if (activatedSkills.size > 0) {
        const skills = await discoverProjectSkills(join(projectsDir, slug, "skills"));
        const parts: string[] = [];
        for (const name of activatedSkills) {
          const skill = skills.get(name);
          if (!skill) continue;
          // Always-active skills are already in the system prompt — skip.
          if (skill.meta.alwaysActive) continue;
          parts.push(`<skill_content name="${name}">\n${skill.body}\n</skill_content>`);
        }
        if (parts.length > 0) {
          skillSection = "\n\nThe following skills were active in the previous session and are re-injected for continuity:\n\n" + parts.join("\n\n");
        }
      }

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
