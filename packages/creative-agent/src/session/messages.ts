// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * Agentchan's only custom AgentMessage variant used in LLM context.
 *
 * Lives in one file because the `declare module` augmentation of
 * `@mariozechner/pi-agent-core`'s `CustomAgentMessages` is module-level.
 */

export const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

export const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    compactionSummary: CompactionSummaryMessage;
  }
}

export function createCompactionSummaryMessage(
  summary: string,
  tokensBefore: number,
  timestamp: string,
): CompactionSummaryMessage {
  return {
    role: "compactionSummary",
    summary,
    tokensBefore,
    timestamp: new Date(timestamp).getTime(),
  };
}
