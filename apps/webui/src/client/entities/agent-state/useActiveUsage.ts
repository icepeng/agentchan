import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  isMessageEntry,
  useSessionData,
  useActiveSessionSelection,
} from "@/client/entities/session/index.js";
import type { SessionEntry } from "@/client/entities/session/index.js";

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cost: number;
  contextTokens: number;
}

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  cost: 0,
  contextTokens: 0,
};

function computeUsageFromEntries(entries: readonly SessionEntry[], branch: readonly SessionEntry[]): SessionUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let cost = 0;
  for (const entry of entries) {
    if (!isMessageEntry(entry) || entry.message.role !== "assistant") continue;
    const u = entry.message.usage;
    if (!u) continue;
    inputTokens += u.input;
    outputTokens += u.output;
    cachedInputTokens += u.cacheRead;
    cacheCreationTokens += u.cacheWrite;
    cost += u.cost.total;
  }

  let contextTokens = 0;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!entry || !isMessageEntry(entry) || entry.message.role !== "assistant") continue;
    const usage = entry.message.usage;
    if (usage) {
      contextTokens = usage.totalTokens;
      break;
    }
  }
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    cost,
    contextTokens,
  };
}

export function useActiveUsage(): SessionUsage {
  const { activeProjectSlug } = useProjectSelectionState();
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  return data ? computeUsageFromEntries(data.entries, data.branch) : EMPTY_USAGE;
}
