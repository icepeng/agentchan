import { nanoid } from "nanoid";
import type { SSEStreamingApi } from "hono/streaming";
import {
  parseSlashCommand,
  findSlashInvocableSkill,
  buildSkillContent,
  type SkillRecord,
  type StoredMessage,
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
 *
 * Storage policy:
 * - Slash invocations are stored as the **raw** user text (`/foo args`).
 *   Expansion happens at LLM-payload build time, not at write time. This
 *   keeps user nodes honest about what the user actually typed and avoids
 *   carrying both raw and expanded copies of the same body in storage.
 * - Always-active auto-loads are a system event with no raw form. They are
 *   stored as a regular text node with `meta: "skill-auto-load"` — the body
 *   is the frozen `<skill_content>` payload from session start, the meta
 *   tag tells the chat UI to render it as a chip rather than a full message
 *   (same pattern as `meta: "compact-summary"`).
 */
export function createSlashService(conversationRepo: ConversationRepo) {
  /**
   * If `text` is a `/skillname [args]` command for an invocable skill,
   * return the expanded `<skill_content>` body. Otherwise return `text`
   * unchanged so callers can pass it through to the LLM as-is.
   *
   * Always-active skills are intentionally not matched: they are auto-invoked
   * once at session start by maybeAutoInvokeAlwaysActive, so a manual slash
   * would just duplicate the body. Unknown skills also pass through, in which
   * case the model sees the literal "/foo".
   */
  function expandSlashCommand(
    projectDir: string,
    skillsMap: Map<string, SkillRecord>,
    text: string,
  ): string {
    const parsed = parseSlashCommand(text);
    if (!parsed) return text;

    const skill = findSlashInvocableSkill(skillsMap, parsed.name);
    if (!skill) return text;

    return buildSkillContent(skill, projectDir, parsed.args);
  }

  /**
   * Walk a flattened message history and re-expand any slash commands stored
   * as raw user text. Re-expansion happens against current skill state, so a
   * skill body change between turns will be reflected in the LLM payload —
   * the trade-off for not duplicating raw + expanded in storage. The user-
   * facing chat history (which renders the raw text) is unaffected.
   *
   * Returns a new array; does not mutate input.
   */
  function expandSlashesInHistory(
    projectDir: string,
    skillsMap: Map<string, SkillRecord>,
    messages: StoredMessage[],
  ): StoredMessage[] {
    return messages.map((msg) => {
      if (msg.role !== "user") return msg;
      let changed = false;
      const newContent = msg.content.map((block) => {
        if (block.type !== "text") return block;
        const expanded = expandSlashCommand(projectDir, skillsMap, block.text);
        if (expanded === block.text) return block;
        changed = true;
        return { ...block, text: expanded };
      });
      return changed ? { ...msg, content: newContent } : msg;
    });
  }

  /**
   * On the first message of a conversation, inject every always-active
   * skill's body as a single user node so the model sees it as recent
   * context (not as a far-away system instruction). Returns the new parent
   * id, or `parentNodeId` unchanged if there was nothing to inject.
   *
   * The expanded body is **frozen** into the node at this point — it is NOT
   * re-evaluated later. If a skill is removed mid-session, prior turns still
   * replay the body that was loaded at the time. (Compare with slash
   * invocations, which store only raw text and re-expand each turn.)
   *
   * The node is marked `meta: "skill-auto-load"` so the chat UI renders it
   * as a "Skill loaded: …" chip instead of a full user bubble. The skill
   * names are recovered from the `<skill_content name="…">` tags inside the
   * body — buildSkillContent owns that format and is the only producer.
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
    const autoNode: TreeNode = {
      id: nanoid(12),
      parentId: null,
      role: "user",
      content: [{ type: "text", text: combined }],
      createdAt: Date.now(),
      meta: "skill-auto-load",
    };
    await conversationRepo.appendNode(slug, conversationId, autoNode);
    await stream.writeSSE({ event: "user_node", data: JSON.stringify(autoNode) });
    return autoNode.id;
  }

  return { expandSlashCommand, expandSlashesInHistory, maybeAutoInvokeAlwaysActive };
}

export type SlashService = ReturnType<typeof createSlashService>;
