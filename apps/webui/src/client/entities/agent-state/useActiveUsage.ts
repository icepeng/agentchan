import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  branchFromLeaf,
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

function computeUsageFromBranch(
  branch: readonly SessionEntry[],
): SessionUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let cost = 0;
  let contextTokens = 0;
  let latestCompactionIndex = -1;

  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i]?.type === "compaction") {
      latestCompactionIndex = i;
      break;
    }
  }

  for (let i = 0; i < branch.length; i++) {
    const entry = branch[i];
    if (!entry) continue;
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const u = entry.message.usage;
    if (!u) continue;
    const input = u.input ?? 0;
    const output = u.output ?? 0;
    const cacheRead = u.cacheRead ?? 0;
    const cacheWrite = u.cacheWrite ?? 0;
    inputTokens += input;
    outputTokens += output;
    cachedInputTokens += cacheRead;
    cacheCreationTokens += cacheWrite;
    cost += u.cost?.total ?? 0;
    if (i > latestCompactionIndex) {
      contextTokens = input + output + cacheRead + cacheWrite;
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

// Cumulative usage is derived from assistant message.usage on the selected branch.
export function useActiveUsage(): SessionUsage {
  const { activeProjectSlug } = useProjectSelectionState();
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  return data ? computeUsageFromBranch(branchFromLeaf(data.entries, data.leafId)) : EMPTY_USAGE;
}
