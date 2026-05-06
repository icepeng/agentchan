// Adapted from @mariozechner/pi-coding-agent 0.70.2. Sync policy: cherry-pick. See ADR-0010.
/**
 * Resolve the message list shown to the LLM from the entry tree.
 *
 * Walks leaf → root, then emits messages along the path:
 *   - With a compaction on the path: emit summary first, then entries from
 *     `firstKeptEntryId` up to the compaction, then entries after it.
 *   - Without compaction: emit each path entry's message in order.
 *
 * Pure function — no fs, no LLM, no clock.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { createCompactionSummaryMessage } from "./messages.js";
import type { CompactionEntry, SessionContext, SessionEntry } from "./types.js";

export function buildSessionContext(
  entries: SessionEntry[],
  leafId?: string | null,
  byId?: Map<string, SessionEntry>,
): SessionContext {
  if (!byId) {
    byId = new Map<string, SessionEntry>();
    for (const entry of entries) byId.set(entry.id, entry);
  }

  // Explicit null = navigated to before first entry → empty context.
  if (leafId === null) {
    return { messages: [], thinkingLevel: "off", model: null };
  }

  let leaf: SessionEntry | undefined;
  if (leafId) leaf = byId.get(leafId);
  if (!leaf) leaf = entries[entries.length - 1];
  if (!leaf) return { messages: [], thinkingLevel: "off", model: null };

  // Walk leaf → root.
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = leaf;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  let thinkingLevel = "off";
  let model: { provider: string; modelId: string } | null = null;
  let compaction: CompactionEntry | null = null;

  for (const entry of path) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel;
    } else if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      model = { provider: entry.message.provider, modelId: entry.message.model };
    } else if (entry.type === "compaction") {
      compaction = entry;
    }
  }

  const messages: AgentMessage[] = [];

  const appendMessage = (entry: SessionEntry) => {
    if (entry.type === "message") {
      messages.push(entry.message);
    }
  };

  if (compaction) {
    messages.push(
      createCompactionSummaryMessage(
        compaction.summary,
        compaction.tokensBefore,
        compaction.timestamp,
      ),
    );

    const compactionIdx = path.findIndex(
      (e) => e.type === "compaction" && e.id === compaction!.id,
    );

    let foundFirstKept = false;
    for (let i = 0; i < compactionIdx; i++) {
      const entry = path[i]!;
      if (entry.id === compaction.firstKeptEntryId) foundFirstKept = true;
      if (foundFirstKept) appendMessage(entry);
    }

    for (let i = compactionIdx + 1; i < path.length; i++) {
      appendMessage(path[i]!);
    }
  } else {
    for (const entry of path) appendMessage(entry);
  }

  return { messages, thinkingLevel, model };
}
