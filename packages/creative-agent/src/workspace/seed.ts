/**
 * Seed/user-node helpers used internally by CreativeSession and CreativeWorkspace.
 *
 * These were previously in `apps/webui/src/server/services/slash.service.ts`.
 * They are package-internal — not re-exported from the package index — because
 * the public surface is the Session/Workspace methods that consume them.
 */

import { join } from "node:path";
import { nanoid } from "nanoid";
import type { ContentBlock, TreeNode } from "../types.js";
import { discoverProjectSkills } from "../skills/discovery.js";
import { buildSkillContent } from "../skills/skill-content.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";
import { findSlashInvocableSkill } from "../slash/catalog.js";

/**
 * Build the user TreeNode (and the LLM-facing text) for a raw user prompt.
 *
 * If the input begins with a slash command that resolves to an invocable
 * skill, the user node carries two text blocks: the serialized command and
 * the skill body. Plain prompts pass through as a single text block.
 *
 * Skill discovery is only performed when the input could be a slash command
 * (avoids a directory walk on every chat turn).
 */
export async function buildUserNodeForPrompt(
  rawText: string,
  projectDir: string,
  parentNodeId: string | null,
): Promise<{ node: TreeNode; llmText: string }> {
  const content = await buildUserNodeContent(rawText, projectDir);
  const node: TreeNode = {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content,
    createdAt: Date.now(),
  };
  return { node, llmText: joinUserNodeText(content) };
}

async function buildUserNodeContent(
  rawText: string,
  projectDir: string,
): Promise<ContentBlock[]> {
  if (!rawText.trimStart().startsWith("/")) {
    return [{ type: "text", text: rawText }];
  }
  const parsed = parseSlashInput(rawText);
  if (!parsed) return [{ type: "text", text: rawText }];

  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  const skill = findSlashInvocableSkill(skills, parsed.name);
  if (!skill) return [{ type: "text", text: rawText }];

  return [
    { type: "text", text: serializeCommand(parsed.name, parsed.args) },
    { type: "text", text: buildSkillContent(skill, projectDir, parsed.args) },
  ];
}

/**
 * Build a single user node containing every always-active skill body.
 *
 * Returns null when there are no always-active skills. Does NOT persist —
 * the caller (Workspace.createConversation / compactConversation) is
 * responsible for `appendNode`.
 */
export async function buildAlwaysActiveSeedNode(
  projectDir: string,
  parentNodeId: string | null,
): Promise<TreeNode | null> {
  const skills = await discoverProjectSkills(join(projectDir, "skills"));
  const active = [...skills.values()].filter((s) => s.meta.alwaysActive);
  if (active.length === 0) return null;

  const text = active.map((s) => buildSkillContent(s, projectDir, "")).join("\n\n");
  return {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [{ type: "text", text }],
    createdAt: Date.now(),
    meta: "skill-auto-load",
  };
}

export function joinUserNodeText(content: ContentBlock[]): string {
  return content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n");
}
