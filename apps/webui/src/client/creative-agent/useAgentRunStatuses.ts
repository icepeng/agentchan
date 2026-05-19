import { useSyncExternalStore } from "react";
import { useAgentStreamStore } from "./stream/AgentStreamStoreContext.js";
import type { AgentRunStatus } from "./stream/agentStreamStore.js";

const EMPTY_STATUSES: ReadonlyMap<string, AgentRunStatus> = new Map();

export function useAgentRunStatuses(): ReadonlyMap<string, AgentRunStatus> {
  const store = useAgentStreamStore();
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getStatuses(),
    () => EMPTY_STATUSES,
  );
}
