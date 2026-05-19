import { useSyncExternalStore } from "react";
import type { AgentState } from "@agentchan/creative-agent/browser";
import { useSessionRoot } from "./SessionRootContext.js";
import { useAgentStreamStore } from "./stream/AgentStreamStoreContext.js";

const IDLE_AGENT_STATE: AgentState = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: new Set(),
};

export function useAgentStream(projectSlug?: string | null): AgentState {
  const { slug: activeProjectSlug } = useSessionRoot();
  const slug = projectSlug ?? activeProjectSlug;
  const store = useAgentStreamStore();
  return useSyncExternalStore(
    (listener) => (slug ? store.subscribe(listener, slug) : () => {}),
    () => store.getStateFor(slug),
    () => IDLE_AGENT_STATE,
  );
}
