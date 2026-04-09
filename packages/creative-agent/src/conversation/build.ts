/**
 * Pure helpers that build user TreeNodes for the skill-injection paths
 * (always-active seeding, slash invocation, plain prompt, activate_skill).
 *
 * Callers pass in an already-loaded skill map so these stay decoupled from
 * skill discovery.
 */

import { nanoid } from "nanoid";
import type { ContentBlock, TreeNode } from "../types.js";
import { buildSkillContent } from "../skills/skill-content.js";
import type { SkillRecord } from "../skills/types.js";
import { parseSlashInput, serializeCommand } from "../slash/parse.js";
import { findSlashInvocableSkill } from "../slash/catalog.js";

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
 * Slash → skill returns two nodes (chip first, slash text as its child)
 * so regenerate/branch from descendants always replay the skill body via
 * history — matching always-active seeding's "skill loaded, then user
 * speaks" order. Plain prompts return a single node.
 *
 * `llmText` is the text fed to `agent.prompt()`; for the two-node case the
 * chip is left in history and convert.ts merges consecutive user messages.
 */
export function buildUserNodeForPrompt(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
  parentNodeId: string | null,
): { nodes: TreeNode[]; llmText: string } {
  const slashBranch = tryBuildSlashSkillNodes(rawText, projectDir, skills, parentNodeId);
  if (slashBranch) return slashBranch;

  const node: TreeNode = {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [{ type: "text", text: rawText }],
    createdAt: Date.now(),
  };
  return { nodes: [node], llmText: rawText };
}

function tryBuildSlashSkillNodes(
  rawText: string,
  projectDir: string,
  skills: Map<string, SkillRecord>,
  parentNodeId: string | null,
): { nodes: TreeNode[]; llmText: string } | null {
  if (!rawText.trimStart().startsWith("/")) return null;
  const parsed = parseSlashInput(rawText);
  if (!parsed) return null;

  const skill = findSlashInvocableSkill(skills, parsed.name);
  if (!skill) return null;

  const skillText = buildSkillInjectionContent([skill], projectDir);
  const skillNode: TreeNode = {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [{ type: "text", text: skillText }],
    createdAt: Date.now(),
    meta: "skill-load",
  };
  const userText = serializeCommand(parsed.name, parsed.args);
  const userNode: TreeNode = {
    id: nanoid(12),
    parentId: skillNode.id,
    role: "user",
    content: [{ type: "text", text: userText }],
    createdAt: Date.now(),
  };
  return { nodes: [skillNode, userNode], llmText: userText };
}

/**
 * Build a single user node containing every always-active skill body.
 * Does NOT persist — the caller is responsible for `appendNode`.
 */
export function buildAlwaysActiveSeedNode(
  projectDir: string,
  skills: Map<string, SkillRecord>,
  parentNodeId: string | null,
): TreeNode | null {
  const active = [...skills.values()].filter((s) => s.meta.alwaysActive);
  if (active.length === 0) return null;

  const text = buildSkillInjectionContent(active, projectDir);
  return {
    id: nanoid(12),
    parentId: parentNodeId,
    role: "user",
    content: [{ type: "text", text }],
    createdAt: Date.now(),
    meta: "skill-load",
  };
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
