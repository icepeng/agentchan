import { useEffect } from "react";
import type { AgentEvent } from "@/client/entities/session/index.js";
import { useLatestRef } from "@/client/shared/useLatestRef.js";
import { subscribeAgentEvents } from "@/client/entities/agent-state/index.js";

export function useAgentEventSubscription(
  slug: string | null,
  onEvent: (event: AgentEvent) => void,
): void {
  const onEventRef = useLatestRef(onEvent);

  useEffect(() => {
    if (!slug) return;
    return subscribeAgentEvents((eventSlug, event) => {
      if (eventSlug !== slug) return;
      onEventRef.current(event);
    });
  }, [slug, onEventRef]);
}
