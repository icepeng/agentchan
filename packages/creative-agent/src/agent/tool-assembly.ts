import type { AgentTool } from "@mariozechner/pi-agent-core";

import { createProjectTools } from "../tools/index.js";
import { createValidateRendererTool } from "../tools/validate-renderer.js";
import { createActivateSkillTool } from "../skills/manager.js";
import type { SkillRecord } from "../skills/types.js";
import type { SessionMode } from "../session/format.js";

export function assembleAgentTools(
  projectDir: string,
  envSkills: Map<string, SkillRecord>,
  sessionMode?: SessionMode,
): AgentTool<any, any>[] {
  const tools: AgentTool<any, any>[] = createProjectTools(projectDir);
  if (envSkills.size > 0) tools.push(createActivateSkillTool(envSkills, projectDir));
  if (sessionMode === "meta") tools.push(createValidateRendererTool(projectDir));
  return tools;
}
