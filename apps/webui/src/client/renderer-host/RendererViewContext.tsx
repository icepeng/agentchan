import { useSyncExternalStore, type Dispatch } from "react";
import type {
  RendererSnapshot,
  RendererTheme,
} from "@agentchan/renderer/host";

/** Singleton: only the active project's renderer output is on screen. */
interface RendererViewState {
  digest: string | null;
  snapshot: RendererSnapshot | null;
  theme: RendererTheme | null;
  error: string | null;
}

// Server-driven data store. Host lifecycle (mount visibility, error gating)
// is owned by the renderer-host presentation machine, not this reducer.
type RendererViewAction =
  | { type: "SET_RENDERER"; digest: string; snapshot: RendererSnapshot }
  | { type: "SET_SNAPSHOT"; snapshot: RendererSnapshot }
  | { type: "SET_THEME"; theme: RendererTheme | null }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR" };

function reducer(state: RendererViewState, action: RendererViewAction): RendererViewState {
  switch (action.type) {
    case "SET_RENDERER":
      return {
        ...state,
        digest: action.digest,
        snapshot: action.snapshot,
        error: null,
      };
    case "SET_SNAPSHOT":
      return { ...state, snapshot: action.snapshot, error: null };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "SET_ERROR":
      return {
        ...state,
        digest: null,
        snapshot: null,
        error: action.error,
      };
    case "CLEAR":
      return { digest: null, snapshot: null, theme: null, error: null };
    default:
      return state;
  }
}

const initialState: RendererViewState = {
  digest: null,
  snapshot: null,
  theme: null,
  error: null,
};

const listeners = new Set<() => void>();
let currentState = initialState;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const dispatch: Dispatch<RendererViewAction> = (action) => {
  const next = reducer(currentState, action);
  if (next === currentState) return;
  currentState = next;
  for (const listener of listeners) listener();
};

function getSnapshot() {
  return currentState;
}

export function useRendererViewState(): RendererViewState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRendererViewDispatch() {
  return dispatch;
}

export function useProjectTheme(): RendererTheme | null {
  return useRendererViewState().theme;
}
