import type { Message } from "@mariozechner/pi-ai";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
  selectBranch,
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
  entries: ReadonlyArray<SessionEntry>,
  leafId: string | null,
): SessionUsage {
  const branch = selectBranch(entries, leafId);
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let cost = 0;
  let contextTokens = 0;

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!entry || entry.type !== "message") continue;
    const msg = entry.message as Message;
    if (msg.role !== "assistant") continue;
    const u = msg.usage;
    if (!u) continue;
    inputTokens += u.input ?? 0;
    outputTokens += u.output ?? 0;
    cachedInputTokens += u.cacheRead ?? 0;
    cacheCreationTokens += u.cacheWrite ?? 0;
    cost += u.cost?.total ?? 0;
    if (contextTokens === 0) {
      contextTokens =
        (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
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

/** Cumulative usage derived from persisted assistant message entries on the active branch. */
export function useActiveUsage(): SessionUsage {
  const { activeProjectSlug } = useProjectSelectionState();
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  return data ? computeUsageFromBranch(data.entries, data.leafId) : EMPTY_USAGE;
}
