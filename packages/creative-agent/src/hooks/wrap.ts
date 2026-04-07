import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tools/util.js";
import type { HookRunner } from "./types.js";

/**
 * Wrap an AgentTool so PreToolUse hooks can block or rewrite the call and
 * PostToolUse hooks observe the result. Forwards all execute() arguments
 * (toolCallId, params, signal, onUpdate) so abort and streaming still work.
 */
export function wrapToolWithHooks<TDetails = any>(
  tool: AgentTool<any, TDetails>,
  runner: HookRunner,
): AgentTool<any, TDetails> {
  const hasPre = runner.has("PreToolUse");
  const hasPost = runner.has("PostToolUse");
  if (!hasPre && !hasPost) return tool;

  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      if (hasPre) {
        const pre = await runner.run("PreToolUse", {
          tool_name: tool.name,
          tool_input: params,
        });
        if (pre.blocked) {
          const reason = pre.reason ?? "blocked by PreToolUse hook";
          return textResult(`[hook denied] ${reason}`) as AgentToolResult<TDetails>;
        }
        if (pre.updatedInput !== undefined) {
          params = pre.updatedInput as typeof params;
        }
      }

      const result = await tool.execute(toolCallId, params, signal, onUpdate);

      if (hasPost) {
        // Awaited (not fire-and-forget) so logs are deterministic, but the
        // block decision is ignored — the tool already ran.
        await runner.run("PostToolUse", {
          tool_name: tool.name,
          tool_input: params,
          tool_output: result,
        });
      }

      return result;
    },
  };
}
