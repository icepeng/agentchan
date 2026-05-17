import { createContext, createElement, use, useState, type ReactNode } from "react";
import type { AgentEvent } from "@agentchan/creative-agent/browser";

export type AgentEventListener = (slug: string, event: AgentEvent) => void;

export interface AgentEventBus {
  publish(slug: string, event: AgentEvent): void;
  subscribe(listener: AgentEventListener): () => void;
}

export function createAgentEventBus(): AgentEventBus {
  const listeners = new Set<AgentEventListener>();
  return {
    publish(slug, event) {
      for (const listener of listeners) {
        try {
          listener(slug, event);
        } catch (err) {
          console.error("[agent-event-bus] listener threw", err);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const AgentEventBusContext = createContext<AgentEventBus | null>(null);

export function AgentEventBusProvider({ children }: { children: ReactNode }) {
  const [bus] = useState(() => createAgentEventBus());
  return createElement(AgentEventBusContext.Provider, { value: bus }, children);
}

export function useAgentEventBus(): AgentEventBus {
  const bus = use(AgentEventBusContext);
  if (!bus) throw new Error("useAgentEventBus must be used within SessionProvider");
  return bus;
}
