// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * AgentMessage → LLM Message conversion.
 *
 * Lives in the agent layer (LLM-shape responsibility), not in session/, so
 * the dependency points one way: agent → session/messages.ts for Agentchan's
 * one custom LLM-context variant.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";

import {
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  type CompactionSummaryMessage,
} from "../session/messages.js";

type LiveAgentMessage = Message | CompactionSummaryMessage;

function isLiveAgentMessage(message: AgentMessage): message is LiveAgentMessage {
  return (
    message.role === "user" ||
    message.role === "assistant" ||
    message.role === "toolResult" ||
    message.role === "compactionSummary"
  );
}

function convertLiveMessageToLlm(m: LiveAgentMessage): Message {
  switch (m.role) {
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
      const _exhaustiveCheck: never = m;
      return _exhaustiveCheck;
    }
  }
}

export function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .map((m): Message | undefined => {
      if (!isLiveAgentMessage(m)) return undefined;
      return convertLiveMessageToLlm(m);
    })
    .filter((m): m is Message => m !== undefined);
}
