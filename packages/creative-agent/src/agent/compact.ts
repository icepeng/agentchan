/**
 * Context compaction utilities for pi-ai Message format.
 *
 * - microCompact: replaces old tool result content with short placeholders.
 *   Works as a `transformContext` hook for pi-agent-core's Agent.
 * - fullCompact: LLM-based conversation summarization for session handoff.
 */

import { completeSimple, type Model, type Api } from "@mariozechner/pi-ai";
import type { Message, ToolResultMessage, AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { formatTokens } from "@agentchan/estimate-tokens";
import * as log from "../logger.js";

export const KEEP_RECENT = 3;
const MIN_CONTENT_LENGTH = 500;

/**
 * Micro-compact tool results in a message history.
 * Keeps the last `keepRecent` tool results intact; older ones with
 * content longer than MIN_CONTENT_LENGTH get replaced with placeholders.
 *
 * Does NOT mutate the original array.
 */
export function microCompact(
  messages: AgentMessage[],
  keepRecent = KEEP_RECENT,
  protectFromIndex = messages.length,
): AgentMessage[] {
  // Build toolCallId → tool name map from assistant messages
  const toolNameMap = new Map<string, string>();
  for (const msg of messages) {
    if ((msg as Message).role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      for (const block of assistantMsg.content) {
        if (block.type === "toolCall") {
          toolNameMap.set((block).id, (block).name);
        }
      }
    }
  }

  // Collect tool result references only from messages BEFORE the protected range
  const refs: { msgIdx: number; toolCallId: string; contentLen: number }[] = [];
  for (let i = 0; i < Math.min(messages.length, protectFromIndex); i++) {
    const msg = messages[i] as Message;
    if (msg.role === "toolResult") {
      const toolResult = msg as ToolResultMessage;
      const contentLen = toolResult.content
        .map((c) => ("text" in c ? c.text.length : 0))
        .reduce((a, b) => a + b, 0);
      refs.push({ msgIdx: i, toolCallId: toolResult.toolCallId, contentLen });
    }
  }

  if (refs.length <= keepRecent) return messages;

  // Determine which toolCallIds to compact (old + long enough)
  const toClearIds = new Set(
    refs
      .slice(0, -keepRecent)
      .filter((r) => r.contentLen > MIN_CONTENT_LENGTH)
      .map((r) => r.toolCallId),
  );

  if (toClearIds.size === 0) return messages;

  log.debug("agent", `compacted ${toClearIds.size} of ${messages.length} tool results`);

  // Shallow-copy array, only deep-copy messages that need changes
  return messages.map((msg) => {
    const piMsg = msg as Message;
    if (piMsg.role !== "toolResult") return msg;

    const toolResult = piMsg as ToolResultMessage;
    if (!toClearIds.has(toolResult.toolCallId)) return msg;

    const toolName = toolNameMap.get(toolResult.toolCallId) ?? "unknown";
    return {
      ...toolResult,
      content: [{ type: "text" as const, text: `[Previous: used ${toolName}]` }],
    };
  });
}

// --- Full compact: LLM-based conversation summarization ---

const COMPACT_SYSTEM_PROMPT = `You are a creative AI assistant tasked with summarizing conversations. Do NOT continue the conversation. Respond with TEXT ONLY.`;

const COMPACT_SUMMARY_REQUEST = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools. Tool calls will be REJECTED. Your entire response must be an <analysis> block followed by a <summary> block.

Your task is to create a detailed summary of the conversation so far, paying close attention to the user's creative requests and the assistant's actions.
This summary will be placed at the start of a new session to preserve context. Summarize thoroughly so that someone reading only your summary can fully understand what happened and continue the creative work.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts. In your analysis:

1. Chronologically analyze each section of the conversation. For each section identify:
   - The user's explicit requests and creative direction
   - The assistant's approach and creative choices
   - Key decisions on narrative, characters, world-building, tone, and style
   - Specific details: file names, written content excerpts, character traits, plot points
   - Issues encountered and how they were resolved
   - Pay special attention to user feedback, especially corrections or changed creative direction
2. Double-check for accuracy and completeness.

Your summary should include the following sections:

1. Creative Direction: Capture the user's goals — what they are building, the genre, tone, and creative vision.
2. Characters and World: List characters (names, traits, relationships, voice) and world-building details established so far.
3. Written Content: Enumerate files created or modified. Include key excerpts and describe why each matters to the project.
4. Style and Constraints: Document agreed-upon writing style, tone, POV, formatting rules, and any constraints the user specified.
5. All User Messages: List ALL user messages that are not tool results. These are critical for understanding feedback and changing intent.
6. Pending Tasks: Outline any pending creative tasks explicitly asked to work on.
7. Current Work: Describe precisely what was being worked on immediately before this summary, with file names and details.
8. Context for Continuation: Summarize decisions, narrative state, and context needed to continue. Include direct quotes from recent conversation showing the last task and where it left off.

Format your output as:

<analysis>
[Your thorough analysis]
</analysis>

<summary>
1. Creative Direction:
   [Detailed description]

2. Characters and World:
   - [Character/element 1]
   - [...]

3. Written Content:
   - [File/Content 1]
     - [Why important]
     - [Key excerpt]
   - [...]

4. Style and Constraints:
   - [Rule/decision 1]
   - [...]

5. All User Messages:
   - [Message 1]
   - [...]

6. Pending Tasks:
   - [Task 1]
   - [...]

7. Current Work:
   [Precise description]

8. Context for Continuation:
   [Key context and decisions needed]
</summary>`;

/**
 * Strip the `<analysis>` scratchpad and extract `<summary>` content.
 * Handles truncated responses where `</summary>` may be missing.
 */
export function formatCompactSummary(raw: string): string {
  let result = raw;

  // Strip analysis section
  result = result.replace(/<analysis>[\s\S]*?<\/analysis>/i, "");

  const closedMatch = result.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (closedMatch?.[1]?.trim()) {
    result = closedMatch[1].trim();
  } else {
    const openMatch = result.match(/<summary>([\s\S]*)/i);
    if (openMatch?.[1]?.trim()) {
      result = openMatch[1].trim();
    }
  }

  // Clean up whitespace
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

export interface FullCompactOptions {
  messages: Message[];
  model: Model<Api>;
  apiKey: string;
}

export interface FullCompactResult {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * Summarize a conversation using an LLM call.
 * Pre-processes with microCompact to reduce tool result tokens.
 */
export async function fullCompact(options: FullCompactOptions): Promise<FullCompactResult> {
  const { model, apiKey } = options;

  // Reduce tool result tokens before summarization
  const compacted = microCompact(options.messages as AgentMessage[]) as Message[];

  log.info("agent", `full compact: ${compacted.length} messages → summarizing with ${model.id}`);

  const summaryRequest: Message = {
    role: "user",
    content: [{ type: "text", text: COMPACT_SUMMARY_REQUEST }],
    timestamp: Date.now(),
  };

  const response = await completeSimple(model, {
    systemPrompt: COMPACT_SYSTEM_PROMPT,
    messages: [...compacted, summaryRequest],
  }, { apiKey, maxTokens: model.maxTokens });

  // Extract text from response
  const rawText = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const summary = formatCompactSummary(rawText);

  if (!summary) {
    throw new Error("Compact summary is empty — the model response did not contain extractable summary content");
  }

  log.info(
    "agent",
    `full compact done: ${formatTokens(response.usage.input)} in + ${formatTokens(response.usage.output)} out, $${response.usage.cost.total.toFixed(4)}`,
  );

  return {
    summary,
    inputTokens: response.usage.input,
    outputTokens: response.usage.output,
    cost: response.usage.cost.total,
  };
}
