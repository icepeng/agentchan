import {
  createContext,
  use,
  useState,
  type ReactNode,
} from "react";

export interface SessionRootValue {
  slug: string | null;
  sessionId: string | null;
  viewMode: "chat" | "edit" | null;
  agentPanelOpen: boolean;
  toggleAgentPanel: () => void;
  onOpenSession: (sessionId: string | null) => void;
  onRequestProjectActivation: (slug: string) => void;
  onRequestProjectReadme: () => void;
  onToggleViewMode: () => void;
}

export interface SessionRootProviderProps {
  slug: string | null;
  sessionId: string | null;
  viewMode: "chat" | "edit" | null;
  onOpenSession: (sessionId: string | null) => void;
  onRequestProjectActivation: (slug: string) => void;
  onRequestProjectReadme: () => void;
  onToggleViewMode: () => void;
  children: ReactNode;
}

const SessionRootContext = createContext<SessionRootValue | null>(null);

export function SessionRootProvider({
  slug,
  sessionId,
  viewMode,
  onOpenSession,
  onRequestProjectActivation,
  onRequestProjectReadme,
  onToggleViewMode,
  children,
}: SessionRootProviderProps) {
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  const value: SessionRootValue = {
    slug,
    sessionId,
    viewMode,
    agentPanelOpen,
    toggleAgentPanel: () => setAgentPanelOpen((open) => !open),
    onOpenSession,
    onRequestProjectActivation,
    onRequestProjectReadme,
    onToggleViewMode,
  };

  return (
    <SessionRootContext.Provider value={value}>
      {children}
    </SessionRootContext.Provider>
  );
}

export function useSessionRoot() {
  const value = use(SessionRootContext);
  if (!value) throw new Error("useSessionRoot must be used within SessionProvider");
  return value;
}

export function useAgentPanel() {
  const { agentPanelOpen, toggleAgentPanel } = useSessionRoot();
  return { agentPanelOpen, toggleAgentPanel };
}
