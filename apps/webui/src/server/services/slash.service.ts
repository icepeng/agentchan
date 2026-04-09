import { nanoid } from "nanoid";
import {
  buildSkillContent,
  parseSlashInput,
  serializeCommand,
  findSlashInvocableSkill,
  type SkillRecord,
} from "@agentchan/creative-agent";
import type { ContentBlock, TreeNode } from "../types.js";
import type { ConversationRepo } from "../repositories/conversation.repo.js";

export function createSlashService(conversationRepo: ConversationRepo) {
  function buildUserNodeContent(
    rawInput: string,
    projectDir: string,
    skills: Map<string, SkillRecord>,
  ): ContentBlock[] {
    const parsed = parseSlashInput(rawInput);
    if (!parsed) return [{ type: "text", text: rawInput }];
    const skill = findSlashInvocableSkill(skills, parsed.name);
    if (!skill) return [{ type: "text", text: rawInput }];
    return [
      { type: "text", text: serializeCommand(parsed.name, parsed.args) },
      { type: "text", text: buildSkillContent(skill, projectDir, parsed.args) },
    ];
  }

  async function seedAlwaysActiveSkills(
    slug: string,
    conversationId: string,
    parentNodeId: string | null,
    projectDir: string,
    skills: Map<string, SkillRecord>,
  ): Promise<TreeNode | null> {
    const active = [...skills.values()].filter((s) => s.meta.alwaysActive);
    if (active.length === 0) return null;
    const text = active
      .map((s) => buildSkillContent(s, projectDir, ""))
      .join("\n\n");
    const node: TreeNode = {
      id: nanoid(12),
      parentId: parentNodeId,
      role: "user",
      content: [{ type: "text", text }],
      createdAt: Date.now(),
      meta: "skill-auto-load",
    };
    await conversationRepo.appendNode(slug, conversationId, node);
    return node;
  }

  function joinUserNodeText(content: ContentBlock[]): string {
    return content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n");
  }

  return {
    buildUserNodeContent,
    seedAlwaysActiveSkills,
    joinUserNodeText,
  };
}

export type SlashService = ReturnType<typeof createSlashService>;
