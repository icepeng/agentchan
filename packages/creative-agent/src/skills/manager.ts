import { relative } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { UserMessage } from "@mariozechner/pi-ai";
import { textResult } from "../tools/util.js";
import * as log from "../logger.js";
import type { SkillRecord } from "./types.js";

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

const ActivateSkillParams = Type.Object({
  name: Type.String({
    description: "The skill name from the available skills catalog",
  }),
});

type ActivateSkillInput = Static<typeof ActivateSkillParams>;

/**
 * Manages skill activation and provides the activate_skill tool.
 */
export class SkillManager {
  private skills: Map<string, SkillRecord>;
  private projectDir: string;
  private onSteer?: (msg: UserMessage) => void;

  constructor(skills: Map<string, SkillRecord>, projectDir: string) {
    this.skills = skills;
    this.projectDir = projectDir;
  }

  /** Wire the steer callback. Called by orchestrator after Agent creation. */
  setSteerCallback(fn: (msg: UserMessage) => void): void {
    this.onSteer = fn;
  }

  createTool(): AgentTool<typeof ActivateSkillParams, void> {
    return {
      name: ACTIVATE_SKILL_TOOL_NAME,
      description: `Load a skill's full instructions. Use when a task matches an available skill's description.

Important:
- Available skills are listed in system-reminder messages in the conversation
- When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Do not invoke a skill that is already running`,
      parameters: ActivateSkillParams,
      label: "Activate skill",

      execute: (_toolCallId: string, params: ActivateSkillInput) => {
        const skill = this.skills.get(params.name);
        if (!skill) {
          log.warn("agent", `unknown skill: "${params.name}"`);
          return Promise.resolve(textResult(
            `Unknown skill: "${params.name}". Available skills: ${[...this.skills.keys()].join(", ")}`,
          ));
        }

        const content = this.buildSkillContent(params.name, skill);

        if (this.onSteer) {
          this.onSteer({ role: "user", content, timestamp: Date.now() });
        }

        log.info("agent", `skill activated: ${params.name}`);
        return Promise.resolve(textResult(`Skill "${params.name}" loaded.`));
      },
    };
  }

  private buildSkillContent(name: string, skill: SkillRecord): string {
    let content = `<skill_content name="${name}">\n`;

    content += skill.body + "\n\n";
    const skillDir = relative(this.projectDir, skill.baseDir);
    content += `Skill directory: ${skillDir}\n`;
    content += `Resource paths are relative to the skill directory. Prefix with the skill directory path when using file tools (e.g., read("${skillDir}/path/to/file")).\n`;

    content += "</skill_content>";
    return content;
  }

  update(skills: Map<string, SkillRecord>, projectDir: string): void {
    this.skills = skills;
    this.projectDir = projectDir;
  }
}
