import { useMemo } from "react";
import { useProjectState } from "@/client/entities/project/index.js";
import { useConversationData } from "@/client/entities/conversation/index.js";
import type { TreeNode } from "@/client/entities/conversation/index.js";
import {
  useActiveSession,
  EMPTY_USAGE,
  type SessionUsage,
} from "./SessionContext.js";

function computeUsageFromNodes(
  nodes: readonly TreeNode[],
  activePath: readonly string[],
): SessionUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let cost = 0;
  for (const node of nodes) {
    const u = node.usage;
    if (!u) continue;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    cachedInputTokens += u.cachedInputTokens ?? 0;
    cacheCreationTokens += u.cacheCreationTokens ?? 0;
    cost += u.cost ?? 0;
  }
  // contextTokens: most recent activePath node with a reported value.
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  let contextTokens = 0;
  for (let i = activePath.length - 1; i >= 0; i--) {
    const id = activePath[i];
    if (!id) continue;
    const ct = byId.get(id)?.usage?.contextTokens;
    if (ct) {
      contextTokens = ct;
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

/**
 * The combined server + in-flight stream usage for the active session.
 *
 *  - `base`: canonical sum across the current activePath's nodes (SWR).
 *  - `delta`: per-round accumulator from `STREAM_USAGE_SUMMARY`, reset on
 *     `STREAM_RESET` / `STREAM_START`.
 *
 * `contextTokens` is latest-wins (LLM reports a snapshot per round), not
 * summed like the token counters — delta wins if non-zero, else base.
 *
 * `base` is memoized separately so the O(n) sum over nodes only re-runs when
 * the SWR cache produces a new data object, not on every text/tool delta
 * (which only changes `delta` — a new reducer object each dispatch).
 */
export function useActiveUsage(): SessionUsage {
  const { activeProjectSlug } = useProjectState();
  const session = useActiveSession();
  const { data } = useConversationData(activeProjectSlug, session.conversationId);
  const delta = session.stream?.streamUsageDelta ?? EMPTY_USAGE;
  const base = useMemo(
    () => (data ? computeUsageFromNodes(data.nodes, data.activePath) : EMPTY_USAGE),
    [data],
  );
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    cachedInputTokens: base.cachedInputTokens + delta.cachedInputTokens,
    cacheCreationTokens: base.cacheCreationTokens + delta.cacheCreationTokens,
    cost: base.cost + delta.cost,
    contextTokens: delta.contextTokens || base.contextTokens,
  };
}
