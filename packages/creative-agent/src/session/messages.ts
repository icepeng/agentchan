// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * Custom AgentMessage variants used in session entries and LLM context.
 *
 * Lives in one file because the `declare module` augmentation of
 * `@mariozechner/pi-agent-core`'s `CustomAgentMessages` is module-level — splitting
 * it would risk type-duplication conflicts. The four message variants and their
 * create helpers stay together for the same reason.
 */

import type { ImageContent, TextContent } from "@mariozechner/pi-ai";

export const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

export const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

export const BRANCH_SUMMARY_PREFIX = `The following is a summary of a branch that this conversation came back from:

<summary>
`;

export const BRANCH_SUMMARY_SUFFIX = `</summary>`;

/** Message type for bash executions via the ! command. */
export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  /** If true, this message is excluded from LLM context (!! prefix). */
  excludeFromContext?: boolean;
}

/** Extension-injected message that participates in LLM context. */
export interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: T;
  timestamp: number;
}

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    bashExecution: BashExecutionMessage;
    custom: CustomMessage;
    branchSummary: BranchSummaryMessage;
    compactionSummary: CompactionSummaryMessage;
  }
}

export function createBranchSummaryMessage(
  summary: string,
  fromId: string,
  timestamp: string,
): BranchSummaryMessage {
  return {
    role: "branchSummary",
    summary,
    fromId,
    timestamp: new Date(timestamp).getTime(),
  };
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

export function createCustomMessage(
  customType: string,
  content: string | (TextContent | ImageContent)[],
  display: boolean,
  details: unknown,
  timestamp: string,
): CustomMessage {
  return {
    role: "custom",
    customType,
    content,
    display,
    details,
    timestamp: new Date(timestamp).getTime(),
  };
}
