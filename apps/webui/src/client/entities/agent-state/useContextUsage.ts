import type { Message } from "@mariozechner/pi-ai";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
  selectBranch,
} from "@/client/entities/session/index.js";

/**
 * **Context usage** — single-entry token estimate of the next LLM call's
 * input size, derived from the *last* assistant **Session entry** on the
 * active **Branch**. Sums input + output + cacheRead + cacheWrite of that
 * one entry; not a session-wide aggregation.
 */
export interface ContextUsage {
  contextTokens: number;
}

export const EMPTY_CONTEXT_USAGE: ContextUsage = { contextTokens: 0 };

export function useContextUsage(): ContextUsage {
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  if (!data) return EMPTY_CONTEXT_USAGE;
  const branch = selectBranch(data.entries, data.leafId);
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!entry || entry.type !== "message") continue;
    const msg = entry.message as Message;
    if (msg.role !== "assistant") continue;
    const u = msg.usage;
    if (!u) continue;
    return {
      contextTokens:
        (u.input ?? 0) +
        (u.output ?? 0) +
        (u.cacheRead ?? 0) +
        (u.cacheWrite ?? 0),
    };
  }
  return EMPTY_CONTEXT_USAGE;
}
