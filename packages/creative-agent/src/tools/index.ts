import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createScriptTool } from "./script.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createAppendTool } from "./append.js";
import { createEditTool } from "./edit.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { wrapToolWithHooks, type HookRunner } from "../hooks/index.js";

/**
 * Create the standard set of project-scoped tools. All file operations are
 * restricted to the given project directory. If a non-empty HookRunner is
 * provided, each tool is wrapped so PreToolUse/PostToolUse hooks fire.
 */
export function createProjectTools(
  projectDir: string,
  hookRunner?: HookRunner,
): AgentTool<any, any>[] {
  const tools: AgentTool<any, any>[] = [
    createScriptTool(projectDir),
    createReadTool(projectDir),
    createWriteTool(projectDir),
    createAppendTool(projectDir),
    createEditTool(projectDir),
    createGrepTool(projectDir),
    createLsTool(projectDir),
  ];
  if (!hookRunner || hookRunner.isEmpty()) return tools;
  return tools.map((t) => wrapToolWithHooks(t, hookRunner));
}
