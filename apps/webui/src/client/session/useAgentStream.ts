import { useSyncExternalStore } from "react";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import type { AgentState } from "@agentchan/creative-agent/browser";
import { EMPTY_AGENT_STATE } from "@agentchan/creative-agent/browser";
import { useAgentStreamStore } from "./stream/AgentStreamStoreContext.js";

export function useAgentStream(projectSlug?: string | null): AgentState {
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const slug = projectSlug ?? activeProjectSlug;
  const store = useAgentStreamStore();
  return useSyncExternalStore(
    (listener) => (slug ? store.subscribe(listener, slug) : () => {}),
    () => store.getStateFor(slug),
    () => EMPTY_AGENT_STATE,
  );
}
