import type { ReactNode } from "react";
import { AgentStateProvider } from "@/client/entities/agent-state/index.js";
import { SessionSelectionProvider } from "@/client/entities/session/index.js";
import { AgentEventBusProvider } from "./stream/agentEventBus.js";
import { AgentStreamStoreProvider } from "./stream/AgentStreamStoreContext.js";

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionSelectionProvider>
      <AgentStateProvider>
        <AgentStreamStoreProvider>
          <AgentEventBusProvider>{children}</AgentEventBusProvider>
        </AgentStreamStoreProvider>
      </AgentStateProvider>
    </SessionSelectionProvider>
  );
}
