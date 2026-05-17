import type { ReactNode } from "react";
import { AgentStateProvider } from "@/client/entities/agent-state/index.js";
import { SessionSelectionProvider } from "@/client/entities/session/index.js";

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionSelectionProvider>
      <AgentStateProvider>{children}</AgentStateProvider>
    </SessionSelectionProvider>
  );
}
