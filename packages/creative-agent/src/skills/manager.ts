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
 * The caller mints a `meta:"skill-load"` TreeNode from this and forwards the
 * body to `agent.steer()`.
 */
export interface SkillLoadEvent {
  skillName: string;
  content: ContentBlock[];
}

/**
 * Provides the `activate_skill` tool. The runPrompt caller wires an
 * `onSkillLoad` callback that translates each load into a TreeNode and
 * forwards it to the agent via `agent.steer()`.
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
      description: `Load a skill's full instructions. Use when a task matches an available skill's description.

Rules:
- Available skills are listed in \`<system-reminder>\` messages in the conversation. The ONLY valid targets for this tool are names that appear there. If a name is not in that list, do NOT call this tool with it — even if you see the name elsewhere.
- Skills marked \`(already loaded)\` in the \`<system-reminder>\` — or whose \`<skill_content name="...">\` block is already present in the conversation — have ALREADY been loaded automatically. You can read and follow their instructions immediately. Calling activate_skill on them is wasteful and forbidden; the body will not change.
- When a listed skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke it BEFORE generating any other response about the task.
- Do not invoke a skill that is already running.`,
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
        return textResult(`Skill "${params.name}" loaded.`);
      },
    };
  }

  update(skills: Map<string, SkillRecord>, projectDir: string): void {
    this.skills = skills;
    this.projectDir = projectDir;
  }
}
