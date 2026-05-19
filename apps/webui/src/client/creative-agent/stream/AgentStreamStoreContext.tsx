import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  createAgentStreamStore,
  type AgentStreamAction,
  type AgentStreamStore,
} from "./agentStreamStore.js";
import { registerAgentStreamStore } from "./cancelAgentRun.js";

const AgentStreamStoreContext = createContext<AgentStreamStore | null>(null);

export function AgentStreamStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAgentStreamStore());
  useEffect(() => registerAgentStreamStore(store), [store]);
  return (
    <AgentStreamStoreContext.Provider value={store}>
      {children}
    </AgentStreamStoreContext.Provider>
  );
}

export function useAgentStreamStore(): AgentStreamStore {
  const store = use(AgentStreamStoreContext);
  if (!store) throw new Error("useAgentStreamStore must be used within SessionProvider");
  return store;
}

export function useAgentStreamDispatch(): Dispatch<AgentStreamAction> {
  const store = useAgentStreamStore();
  return useCallback(
    (action) => {
      store.dispatch(action);
    },
    [store],
  );
}
