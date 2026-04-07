import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createScriptTool } from "./script.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createAppendTool } from "./append.js";
import { createEditTool } from "./edit.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";

/**
 * Create the standard set of project-scoped tools.
 * All file operations are restricted to the given project directory.
 */
export function createProjectTools(projectDir: string): AgentTool<any, any>[] {
  return [
    createScriptTool(projectDir),
    createReadTool(projectDir),
    createWriteTool(projectDir),
    createAppendTool(projectDir),
    createEditTool(projectDir),
    createGrepTool(projectDir),
    createLsTool(projectDir),
  ];
}
