import { useCallback } from "react";
import type { AgentEvent } from "@agentchan/creative-agent/browser";
import type { AgentStateAction } from "./stream/agentStreamStore.js";
import { useAgentStreamDispatch } from "./stream/AgentStreamStoreContext.js";
import { useAgentEventBus, type AgentEventBus } from "./stream/agentEventBus.js";

export function recordAgentEvent(
  dispatch: (action: AgentStateAction) => void,
  bus: AgentEventBus,
  slug: string,
  event: AgentEvent,
): void {
  dispatch({ type: "AGENT_EVENT", projectSlug: slug, event });
  bus.publish(slug, event);
}

export function useRecordAgentEvent(): (slug: string, event: AgentEvent) => void {
  const dispatch = useAgentStreamDispatch();
  const bus = useAgentEventBus();
  return useCallback(
    (slug, event) => {
      recordAgentEvent(dispatch, bus, slug, event);
    },
    [bus, dispatch],
  );
}
