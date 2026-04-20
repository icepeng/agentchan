import { useProjectSelectionState } from "@/client/entities/project/index.js";
import type { AgentState } from "./agentState.js";
import { EMPTY_AGENT_STATE } from "./agentState.js";
import { useAgentStateMap } from "./AgentStateContext.js";

/**
 * Returns the pi `AgentState` for the active project (or a given slug).
 *
 * Idle projects share `EMPTY_AGENT_STATE` for referential stability — consumers
 * depending on `state` identity for effect deps won't re-fire for untouched
 * projects.
 */
export function useAgentState(projectSlug?: string | null): AgentState {
  const { activeProjectSlug } = useProjectSelectionState();
  const slug = projectSlug ?? activeProjectSlug;
  const map = useAgentStateMap();
  if (!slug) return EMPTY_AGENT_STATE;
  return map.get(slug) ?? EMPTY_AGENT_STATE;
}
