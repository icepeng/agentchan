import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import * as log from "../logger.js";
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
 * Create the `activate_skill` tool. The skill body is returned directly
 * in the tool result — the normal tool_call→tool_result exchange carries
 * everything; no separate node or callback needed.
 */
export function createActivateSkillTool(
  skills: Map<string, SkillRecord>,
  projectDir: string,
): AgentTool<typeof ActivateSkillParams, void> {
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

    // eslint-disable-next-line @typescript-eslint/require-await -- AgentTool requires async
    execute: async (_toolCallId: string, params: ActivateSkillInput) => {
      const skill = skills.get(params.name);
      if (!skill) {
        log.warn("agent", `unknown skill: "${params.name}"`);
        const invocable = [...skills.values()]
          .filter((s) => !s.meta.disableModelInvocation)
          .map((s) => s.meta.name);
        return textResult(
          `Unknown skill: "${params.name}". Available skills: ${invocable.join(", ")}`,
        );
      }

      log.info("agent", `skill activated: ${params.name}`);
      return textResult(buildSkillContent(skill, projectDir));
    },
  };
}
