/**
 * Session lifecycle ops that touch the LLM or seed agent state.
 *
 * - createSession: storage create
 * - deleteSession: storage delete + per-session agent state cleanup
 * - compactSession: LLM-based summarization, persisted as a same-file CompactionEntry
 */

import type { Message } from "@mariozechner/pi-ai";
import {
  buildAgentHistory,
  type AgentchanSessionInfo,
  type CompactionEntry,
  type DraftEntry,
  type SessionMode,
} from "../session/index.js";
import { fullCompact } from "./compact.js";
import { resolveModel, clearSessionAgentState } from "./orchestrator.js";
import { type AgentContext } from "./context.js";

export interface CreatedSession {
  info: AgentchanSessionInfo;
}

export interface CompactResult {
  info: AgentchanSessionInfo;
  compactionEntry: CompactionEntry;
  newLeafId: string;
}

export async function createSession(
  ctx: AgentContext,
  slug: string,
  mode?: SessionMode,
): Promise<CreatedSession> {
  const info = await ctx.storage.createSession(slug, mode ? { mode } : {});
  return { info };
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

  const history = buildAgentHistory(data.entries, data.leafId);
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
  // firstKeptEntryId = the leaf at compaction time. Pi's `buildSessionContext`
  // will then emit summary first, then keep that single tail entry as anchor
  // before any new turns appended after the compaction.
  const draft: DraftEntry = {
    type: "compaction",
    summary: result.summary,
    firstKeptEntryId: data.leafId,
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
