import type { ReactNode } from "react";
import { SessionSelectionProvider } from "./selection/index.js";
import { AgentEventBusProvider } from "./stream/agentEventBus.js";
import { AgentStreamStoreProvider } from "./stream/AgentStreamStoreContext.js";

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionSelectionProvider>
      <AgentStreamStoreProvider>
        <AgentEventBusProvider>{children}</AgentEventBusProvider>
      </AgentStreamStoreProvider>
    </SessionSelectionProvider>
  );
}
