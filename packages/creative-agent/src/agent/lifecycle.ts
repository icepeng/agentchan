/**
 * Session operations that touch the LLM or seed agent state.
 *
 * - createSession: storage create (no bootstrap entries)
 * - deleteSession: storage delete + per-session agent state cleanup
 * - compactSession: LLM-based summarization, persisted as a compaction entry
 */

import {
  buildSessionContext,
  compact as generateCompaction,
  DEFAULT_COMPACTION_SETTINGS,
  estimateTokens,
  findCutPoint,
} from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { CompactionSettings } from "@mariozechner/pi-coding-agent";

import type { SessionEntry } from "../types.js";
import { branchFromLeaf, type SessionMode } from "../session/format.js";
import { resolveModel, clearSessionAgentState } from "./orchestrator.js";
import { type AgentContext } from "./context.js";

// --- Create / delete ---

export async function createSession(
  ctx: AgentContext,
  slug: string,
  mode?: SessionMode,
) {
  return ctx.storage.createSession(slug, undefined, mode);
}

export async function deleteSession(
  ctx: AgentContext,
  slug: string,
  id: string,
): Promise<void> {
  clearSessionAgentState(id);
  await ctx.storage.deleteSession(slug, id);
}

// --- Compact ---

function entryMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") return entry.message;
  if (entry.type === "branch_summary") {
    return {
      role: "user",
      content: entry.summary,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

function estimateContextTokens(messages: readonly AgentMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokens(message), 0);
}

function prepareAgentchanCompaction(
  branch: SessionEntry[],
  settings: CompactionSettings,
) {
  if (branch.length > 0 && branch[branch.length - 1]?.type === "compaction") {
    return undefined;
  }

  let previousSummary: string | undefined;
  let boundaryStart = 0;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry?.type !== "compaction") continue;
    previousSummary = entry.summary;
    const firstKeptEntryIndex = branch.findIndex((candidate) =>
      candidate.id === entry.firstKeptEntryId,
    );
    boundaryStart = firstKeptEntryIndex >= 0 ? firstKeptEntryIndex : i + 1;
    break;
  }

  const cutPoint = findCutPoint(
    branch,
    boundaryStart,
    branch.length,
    settings.keepRecentTokens,
  );
  const firstKeptEntry = branch[cutPoint.firstKeptEntryIndex];
  if (!firstKeptEntry) return undefined;

  const historyEnd = cutPoint.isSplitTurn
    ? cutPoint.turnStartIndex
    : cutPoint.firstKeptEntryIndex;
  const messagesToSummarize = branch
    .slice(boundaryStart, historyEnd)
    .map(entryMessage)
    .filter((message): message is AgentMessage => message !== undefined);
  const turnPrefixMessages = cutPoint.isSplitTurn
    ? branch
      .slice(cutPoint.turnStartIndex, cutPoint.firstKeptEntryIndex)
      .map(entryMessage)
      .filter((message): message is AgentMessage => message !== undefined)
    : [];

  return {
    firstKeptEntryId: firstKeptEntry.id,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn: cutPoint.isSplitTurn,
    tokensBefore: estimateContextTokens(buildSessionContext(branch).messages),
    previousSummary,
    fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
    settings,
  };
}

export async function compactSession(
  ctx: AgentContext,
  slug: string,
  sessionId: string,
  leafId?: string | null,
) {
  const loaded = await ctx.storage.loadSession(slug, sessionId, leafId);
  if (!loaded) throw new Error("Session not found");
  const branch = branchFromLeaf(loaded.entries, loaded.leafId);
  if (branch.length === 0) {
    throw new Error("Session is empty");
  }

  const cfg = ctx.resolveAgentConfig();
  if (!cfg.apiKey && !cfg.baseUrl) {
    throw new Error(`API key not configured for provider: ${cfg.provider}`);
  }

  const preparation = prepareAgentchanCompaction(branch, DEFAULT_COMPACTION_SETTINGS);
  if (!preparation) {
    const lastEntry = branch[branch.length - 1];
    if (lastEntry?.type === "compaction") {
      throw new Error("Already compacted");
    }
    throw new Error("Nothing to compact");
  }

  const result = await generateCompaction(
    preparation,
    resolveModel(
      cfg.provider,
      cfg.model,
      cfg.baseUrl && cfg.apiFormat
        ? { baseUrl: cfg.baseUrl, apiFormat: cfg.apiFormat }
        : undefined,
    ),
    cfg.apiKey ?? "",
  );

  const entry = await ctx.storage.appendCompaction(slug, sessionId, {
    leafId: loaded.leafId,
    summary: result.summary,
    firstKeptEntryId: result.firstKeptEntryId,
    tokensBefore: result.tokensBefore,
    details: result.details,
  });
  const detail = await ctx.storage.loadSession(slug, sessionId, entry.id);
  if (!detail) throw new Error("Session not found after compaction append");

  return {
    entries: detail.entries,
    leafId: detail.leafId,
    compactionEntryId: entry.id,
  };
}
