import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import {
  initialViewState,
  viewReducer,
  type ViewAction,
  type ViewState,
} from "./viewReducer.js";

const StateContext = createContext<ViewState>(initialViewState());
const DispatchContext = createContext<Dispatch<ViewAction>>(() => {});

export function ViewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(viewReducer, undefined, initialViewState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useViewState() {
  return use(StateContext);
}

export function useViewDispatch() {
  return use(DispatchContext);
}
