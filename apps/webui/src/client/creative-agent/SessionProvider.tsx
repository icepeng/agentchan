import { useEffect, type ReactNode } from "react";
import { SessionSelectionProvider } from "./selection/index.js";
import { useSessionSelectionDispatch } from "./selection/SessionSelectionContext.js";
import { SessionInputProvider } from "./SessionInputContext.js";
import {
  SessionRootProvider,
  type SessionRootProviderProps,
} from "./SessionRootContext.js";
import { AgentEventBusProvider } from "./stream/agentEventBus.js";
import { AgentStreamStoreProvider } from "./stream/AgentStreamStoreContext.js";

type SessionProviderProps = Omit<SessionRootProviderProps, "children"> & {
  children: ReactNode;
};

function ReplyAnchorReset({ sessionId }: { sessionId: string | null }) {
  const dispatch = useSessionSelectionDispatch();

  useEffect(() => {
    dispatch({ type: "SET_REPLY_TO", entryId: null });
  }, [dispatch, sessionId]);

  return null;
}

export function SessionProvider({
  slug,
  sessionId,
  viewMode,
  onOpenSession,
  onRequestProjectActivation,
  onRequestProjectReadme,
  onToggleViewMode,
  children,
}: SessionProviderProps) {
  return (
    <SessionRootProvider
      slug={slug}
      sessionId={sessionId}
      viewMode={viewMode}
      onOpenSession={onOpenSession}
      onRequestProjectActivation={onRequestProjectActivation}
      onRequestProjectReadme={onRequestProjectReadme}
      onToggleViewMode={onToggleViewMode}
    >
      <SessionSelectionProvider>
        <ReplyAnchorReset sessionId={sessionId} />
        <SessionInputProvider>
          <AgentStreamStoreProvider>
            <AgentEventBusProvider>{children}</AgentEventBusProvider>
          </AgentStreamStoreProvider>
        </SessionInputProvider>
      </SessionSelectionProvider>
    </SessionRootProvider>
  );
}
