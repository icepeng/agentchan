/**
 * Pure helpers that build user TreeNodes for skill-injection paths
 * (slash invocation, plain prompt, activate_skill).
 */

import { nanoid } from "nanoid";
import type { ContentBlock, TreeNode } from "../types.js";
import { buildSkillContent } from "../skills/skill-content.js";
import type { SkillRecord } from "../skills/types.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";

/**
 * Format one or more skill bodies into the canonical injection text.
 * Single source of truth for the on-the-wire format used by every
 * skill-injection path.
 */
export function buildSkillInjectionContent(
  skills: SkillRecord[],
  projectDir: string,
): string {
  return skills.map((s) => buildSkillContent(s, projectDir)).join("\n\n");
}

/**
 * Build the user TreeNode(s) for a raw user prompt.
 *
 * Slash → single node with skill body + command text, meta "skill-load".
 * Plain prompts return a single node.
 *
 * `llmText` is the text fed to `agent.prompt()`.
 */
export function buildUserNodeForPrompt(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
  parentNodeId: string | null,
): { nodes: TreeNode[]; llmText: string } {
  const slashNode = tryBuildSlashSkillNode(rawText, projectDir, skills, parentNodeId);
  if (slashNode) return slashNode;

  const node: TreeNode = {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [{ type: "text", text: rawText }],
    createdAt: Date.now(),
  };
  return { nodes: [node], llmText: rawText };
}

function tryBuildSlashSkillNode(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
  parentNodeId: string | null,
): { nodes: TreeNode[]; llmText: string } | null {
  if (!rawText.trimStart().startsWith("/")) return null;
  const parsed = parseSlashInput(rawText);
  if (!parsed) return null;

  const skill = skills.get(parsed.name);
  if (!skill) return null;

  const skillText = buildSkillInjectionContent([skill], projectDir);
  const userText = serializeCommand(parsed.name, parsed.args);
  const node: TreeNode = {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [
      { type: "text", text: skillText },
      { type: "text", text: userText },
    ],
    createdAt: Date.now(),
    meta: "skill-load",
  };
  return { nodes: [node], llmText: skillText + "\n" + userText };
}

/**
 * Build a `meta:"skill-load"` user TreeNode for an activate_skill load.
 * Used inside the runPrompt callback that wires SkillManager to the tree.
 */
export function buildSkillLoadNode(
  content: ContentBlock[],
  parentNodeId: string | null,
): TreeNode {
  return {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content,
    createdAt: Date.now(),
    meta: "skill-load",
  };
}

export function joinUserNodeText(content: ContentBlock[]): string {
  return content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n");
}
