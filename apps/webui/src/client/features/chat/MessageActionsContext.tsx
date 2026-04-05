import { createContext, use, type ReactNode } from "react";

export interface MessageActions {
  switchBranch: (nodeId: string) => void;
  branchFrom: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  regenerate: (userNodeId: string) => void;
  isStreaming: boolean;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

export function MessageActionsProvider({
  children,
  ...actions
}: MessageActions & { children: ReactNode }) {
  return (
    <MessageActionsContext value={actions}>
      {children}
    </MessageActionsContext>
  );
}

export function useMessageActions(): MessageActions {
  const ctx = use(MessageActionsContext);
  if (!ctx) throw new Error("useMessageActions must be used within MessageActionsProvider");
  return ctx;
}
