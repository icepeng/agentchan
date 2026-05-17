import { useEffect } from "react";
import type { AgentEvent } from "@/client/entities/session/index.js";
import { useLatestRef } from "@/client/shared/useLatestRef.js";
import { useAgentEventBus } from "./stream/agentEventBus.js";

export function useAgentEventSubscription(
  slug: string | null,
  onEvent: (event: AgentEvent) => void,
): void {
  const onEventRef = useLatestRef(onEvent);
  const bus = useAgentEventBus();

  useEffect(() => {
    if (!slug) return;
    return bus.subscribe((eventSlug, event) => {
      if (eventSlug !== slug) return;
      onEventRef.current(event);
    });
  }, [bus, slug, onEventRef]);
}
