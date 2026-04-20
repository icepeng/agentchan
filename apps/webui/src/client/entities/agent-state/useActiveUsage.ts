import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
} from "@/client/entities/session/index.js";
import type { TreeNode } from "@/client/entities/session/index.js";

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

// Cumulative usage derived from persisted TreeNode.usage — updates once per
// turn end when `assistant_nodes` rolls usage onto the last assistant node.
export function useActiveUsage(): SessionUsage {
  const { activeProjectSlug } = useProjectSelectionState();
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  return data ? computeUsageFromNodes(data.nodes, data.activePath) : EMPTY_USAGE;
}
