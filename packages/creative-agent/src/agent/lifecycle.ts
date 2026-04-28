/**
 * Session lifecycle ops that touch the LLM or seed agent state.
 *
 * - createSession: storage create
 * - deleteSession: storage delete + per-session agent state cleanup
 * - compactSession: LLM-based summarization, persisted as a same-file CompactionEntry
 */

import type { Message } from "@mariozechner/pi-ai";
import {
  branchFromLeaf,
  buildSessionContext,
  type AgentchanSessionInfo,
  type CompactionEntry,
  type DraftEntry,
  type SessionMessageEntry,
  type SessionMode,
} from "../session/index.js";
import { computeCompactionCutpoint, fullCompact } from "./compact.js";
import { resolveModel, clearSessionAgentState } from "./orchestrator.js";
import { type AgentContext } from "./context.js";

export interface CompactResult {
  info: AgentchanSessionInfo;
  compactionEntry: CompactionEntry;
  newLeafId: string;
}

export function createSession(
  ctx: AgentContext,
  slug: string,
  mode?: SessionMode,
): Promise<AgentchanSessionInfo> {
  return ctx.storage.createSession(slug, mode ? { mode } : {});
}

export async function deleteSession(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  clearSessionAgentState(id);
  await ctx.storage.deleteSession(slug, id);
}

export async function compactSession(
  ctx: AgentContext,
  slug: string,
  sessionId: string,
  leafId?: string | null,
): Promise<CompactResult> {
  const data = await ctx.storage.readSession(slug, sessionId, leafId);
  if (!data) throw new Error(`Session not found: ${slug}/${sessionId}`);
  if (!data.leafId) throw new Error("Session is empty — nothing to compact");

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  const history = buildSessionContext(data.entries, data.leafId ?? undefined).messages;
  const result = await fullCompact({
    messages: history as Message[],
    model: resolveModel(
      cfg.provider,
      cfg.model,
      cfg.baseUrl && cfg.apiFormat
        ? { baseUrl: cfg.baseUrl, apiFormat: cfg.apiFormat }
        : undefined,
    ),
    apiKey: cfg.apiKey,
  });

  const tokensBefore = result.inputTokens + result.outputTokens;
  // Cutpoint mirrors Pi's `findCutPoint`: keep the most recent N tokens of
  // the branch as anchors, summarize the prefix. Without this, a CompactionEntry
  // whose firstKeptEntryId is the leaf would erase the in-progress thread —
  // the LLM would only see "summary + leaf entry" on the next turn.
  const branchMessageEntries = branchFromLeaf(data.entries, data.leafId).filter(
    (e): e is SessionMessageEntry => e.type === "message",
  );
  const firstKeptEntryId = computeCompactionCutpoint(branchMessageEntries);
  const draft: DraftEntry = {
    type: "compaction",
    summary: result.summary,
    firstKeptEntryId,
    tokensBefore,
  };

  const persisted = await ctx.storage.appendAtLeaf(slug, sessionId, data.leafId, [draft]);
  const compactionEntry = persisted[0] as CompactionEntry;

  return {
    info: { ...data.info, modified: new Date(compactionEntry.timestamp) },
    compactionEntry,
    newLeafId: compactionEntry.id,
  };
}
