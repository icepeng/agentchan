import { useSyncExternalStore } from "react";
import { useAgentStreamStore } from "./stream/AgentStreamStoreContext.js";

export function useAgentRunSettleCount(slug: string | null): number {
  const store = useAgentStreamStore();
  return useSyncExternalStore(
    (listener) => (slug ? store.subscribe(listener, slug) : () => {}),
    () => store.getSettleSeq(slug),
    () => 0,
  );
}
