import type { AgentEvent } from "@agentchan/creative-agent/browser";

/**
 * Fan-out point for streaming AgentEvents. The chat streaming hook publishes
 * each event as it arrives; the renderer iframe adapter subscribes for the
 * active project's slug and forwards to `iframe.applyEvent(event)`.
 *
 * Module-level singleton — one stream of events per browser tab. Listeners
 * receive every published event and filter by slug themselves; the alternative
 * of per-slug topic maps complicates teardown without changing throughput.
 */

export type AgentEventListener = (slug: string, event: AgentEvent) => void;

const listeners = new Set<AgentEventListener>();

export function publishAgentEvent(slug: string, event: AgentEvent): void {
  for (const listener of listeners) {
    try {
      listener(slug, event);
    } catch (err) {
      console.error("[agent-event-bus] listener threw", err);
    }
  }
}

export function subscribeAgentEvents(listener: AgentEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
