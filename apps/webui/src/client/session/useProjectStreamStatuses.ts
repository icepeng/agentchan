import { useSyncExternalStore } from "react";
import { useAgentStreamStore } from "./stream/AgentStreamStoreContext.js";
import type { ProjectStreamStatus } from "./stream/agentStreamStore.js";

const EMPTY_STATUSES: ReadonlyMap<string, ProjectStreamStatus> = new Map();

export function useProjectStreamStatuses(): ReadonlyMap<string, ProjectStreamStatus> {
  const store = useAgentStreamStore();
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getStatuses(),
    () => EMPTY_STATUSES,
  );
}
