// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * AgentMessage → LLM Message conversion.
 *
 * Lives in the agent layer (LLM-shape responsibility), not in session/, so
 * the dependency points one way: agent → session/messages.ts for the four
 * custom variants. Filters bashExecution messages flagged with
 * `excludeFromContext` and renders the remaining custom variants as user
 * messages.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";

import {
  BRANCH_SUMMARY_PREFIX,
  BRANCH_SUMMARY_SUFFIX,
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  type BashExecutionMessage,
} from "../session/messages.js";

export function bashExecutionToText(msg: BashExecutionMessage): string {
  let text = `Ran \`${msg.command}\`\n`;
  if (msg.output) {
    text += `\`\`\`\n${msg.output}\n\`\`\``;
  } else {
    text += "(no output)";
  }
  if (msg.cancelled) {
    text += "\n\n(command cancelled)";
  } else if (
    msg.exitCode !== null &&
    msg.exitCode !== undefined &&
    msg.exitCode !== 0
  ) {
    text += `\n\nCommand exited with code ${msg.exitCode}`;
  }
  if (msg.truncated && msg.fullOutputPath) {
    text += `\n\n[Output truncated. Full output: ${msg.fullOutputPath}]`;
  }
  return text;
}

export function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .map((m): Message | undefined => {
      switch (m.role) {
        case "bashExecution":
          if (m.excludeFromContext) return undefined;
          return {
            role: "user",
            content: [{ type: "text", text: bashExecutionToText(m) }],
            timestamp: m.timestamp,
          };
        case "custom": {
          const content =
            typeof m.content === "string"
              ? [{ type: "text" as const, text: m.content }]
              : m.content;
          return {
            role: "user",
            content,
            timestamp: m.timestamp,
          };
        }
        case "branchSummary":
          return {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX,
              },
            ],
            timestamp: m.timestamp,
          };
        case "compactionSummary":
          return {
            role: "user",
            content: [
              {
                type: "text" as const,
                text:
                  COMPACTION_SUMMARY_PREFIX +
                  m.summary +
                  COMPACTION_SUMMARY_SUFFIX,
              },
            ],
            timestamp: m.timestamp,
          };
        case "user":
        case "assistant":
        case "toolResult":
          return m;
        default: {
          // biome-ignore lint/correctness/noSwitchDeclarations: exhaustiveness guard
          const _exhaustiveCheck: never = m;
          void _exhaustiveCheck;
          return undefined;
        }
      }
    })
    .filter((m): m is Message => m !== undefined);
}
