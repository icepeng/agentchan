import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import * as log from "../logger.js";
import type { ContentBlock } from "../types.js";
import { buildSkillContent } from "./skill-content.js";
import type { SkillRecord } from "./types.js";

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

const ActivateSkillParams = Type.Object({
  name: Type.String({
    description: "The skill name from the available skills catalog",
  }),
});

type ActivateSkillInput = Static<typeof ActivateSkillParams>;

/**
 * Payload handed to the runPrompt-supplied callback when a skill is activated.
 * The caller mints a `meta:"skill-load"` TreeNode from this for UI display.
 * The skill body itself is returned directly in the tool result — no steer needed.
 */
export interface SkillLoadEvent {
  skillName: string;
  content: ContentBlock[];
}

/**
 * Provides the `activate_skill` tool. The skill body is returned directly
 * in the tool result. The optional `onSkillLoad` callback lets the caller
 * mint a `meta:"skill-load"` TreeNode for UI display.
 */
export class SkillManager {
  private skills: Map<string, SkillRecord>;
  private projectDir: string;
  private onSkillLoad?: (load: SkillLoadEvent) => void | Promise<void>;

  constructor(skills: Map<string, SkillRecord>, projectDir: string) {
    this.skills = skills;
    this.projectDir = projectDir;
  }

  setOnSkillLoad(fn: (load: SkillLoadEvent) => void | Promise<void>): void {
    this.onSkillLoad = fn;
  }

  createTool(): AgentTool<typeof ActivateSkillParams, void> {
    return {
      name: ACTIVATE_SKILL_TOOL_NAME,
      description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

Important:
- Available skills are listed in \`<system-reminder>\` messages in the conversation.
- When a listed skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke it BEFORE generating any other response about the task.
- If you see a <skill_content> tag with equal name in the conversation, the skill has ALREADY been loaded. Follow the instructions directly instead of calling this tool again.`,
      parameters: ActivateSkillParams,
      label: "Activate skill",

      execute: async (_toolCallId: string, params: ActivateSkillInput) => {
        const skill = this.skills.get(params.name);
        if (!skill) {
          log.warn("agent", `unknown skill: "${params.name}"`);
          const invocable = [...this.skills.values()]
            .filter((s) => !s.meta.disableModelInvocation)
            .map((s) => s.meta.name);
          return textResult(
            `Unknown skill: "${params.name}". Available skills: ${invocable.join(", ")}`,
          );
        }

        const text = buildSkillContent(skill, this.projectDir);
        const content: ContentBlock[] = [{ type: "text", text }];
        await this.onSkillLoad?.({ skillName: skill.meta.name, content });

        log.info("agent", `skill activated: ${params.name}`);
        return textResult(text);
      },
    };
  }

  update(skills: Map<string, SkillRecord>, projectDir: string): void {
    this.skills = skills;
    this.projectDir = projectDir;
  }
}
