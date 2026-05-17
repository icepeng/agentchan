import type { ReactNode } from "react";
import { AgentStateProvider } from "./stream/index.js";
import { SessionSelectionProvider } from "./selection/index.js";
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
