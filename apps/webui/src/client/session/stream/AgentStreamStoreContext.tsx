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
  useAgentStateDispatch,
  type AgentStateAction,
} from "@/client/entities/agent-state/index.js";
import {
  createAgentStreamStore,
  type AgentStreamStore,
} from "./agentStreamStore.js";
import { registerAgentStreamCloser } from "./closeProjectStream.js";

const AgentStreamStoreContext = createContext<AgentStreamStore | null>(null);

export function AgentStreamStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAgentStreamStore());
  const reducerDispatch = useAgentStateDispatch();
  useEffect(
    () =>
      registerAgentStreamCloser((slug) => {
        const action = { type: "CLOSE", projectSlug: slug } as const;
        reducerDispatch(action);
        store.dispatch(action);
      }),
    [reducerDispatch, store],
  );
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

export function useAgentStreamDispatch(): Dispatch<AgentStateAction> {
  const reducerDispatch = useAgentStateDispatch();
  const store = useAgentStreamStore();
  return useCallback(
    (action) => {
      reducerDispatch(action);
      store.dispatch(action);
    },
    [reducerDispatch, store],
  );
}
