import { nanoid } from "nanoid";
import type { SSEStreamingApi } from "hono/streaming";
import {
  parseSlashCommand,
  findSlashInvocableSkill,
  buildSkillContent,
  type SkillRecord,
} from "@agentchan/creative-agent";
import type { TreeNode } from "../types.js";
import type { ConversationRepo } from "../repositories/conversation.repo.js";

/**
 * Slash service — owns every server-side concern that turns a user's
 * `/something` into a domain operation. Right now this is just skill
 * expansion, but the same surface fits future domain-routed slash sources
 * (tools, agents, mcp). Kept separate from agent.service so the agent
 * pipeline (history → LLM → persist → stream) does not have to know about
 * slash semantics.
 */
export function createSlashService(conversationRepo: ConversationRepo) {
  /**
   * If `text` matches a slash command for an invocable skill, expand it into
   * the skill body. Returns the expanded text plus the original raw input as
   * `displayText` (so the UI can show "/skillname" while the model receives
   * the full body). Returns null if the text is not a recognized slash
   * command — callers should send the original text through unchanged.
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
   * On the first message of a conversation, inject every always-active
   * skill's body as a single user node so the model sees it as recent
   * context (not as a far-away system instruction). Returns the new parent
   * id, or `parentNodeId` unchanged if there was nothing to inject.
   *
   * Mirrors the slash invocation format (`<skill_content>` block via
   * buildSkillContent) so the LLM payload is identical to a manual
   * `/skillname` invocation. The displayText is a short label so the chat
   * UI doesn't render the full body.
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

  return { tryExpandSlashCommand, maybeAutoInvokeAlwaysActive };
}

export type SlashService = ReturnType<typeof createSlashService>;
