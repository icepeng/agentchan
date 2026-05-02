// Pure reducer for the Web UI view (page kind + active project + session +
// view mode). React-free so the transition rules and sessionMemory policy can
// be unit tested directly. ADR-0009.

export type ViewMode = "chat" | "edit";

export type SettingsTab = "appearance" | "api-keys";

export type View =
  | { kind: "templates" }
  | { kind: "settings"; tab: SettingsTab }
  | {
      kind: "project";
      slug: string;
      session: string | null;
      mode: ViewMode;
    };

export type ViewKind = View["kind"];

export interface ViewState {
  view: View;
  /** slug → last opened sessionId. View mode is intentionally not memoized. */
  sessionMemory: ReadonlyMap<string, string>;
}

export type ViewAction =
  | { type: "OPEN_TEMPLATES" }
  | { type: "OPEN_SETTINGS"; tab?: SettingsTab }
  | { type: "OPEN_PROJECT"; slug: string; session?: string | null }
  | { type: "OPEN_SESSION"; sessionId: string | null }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "FORGET_PROJECT"; slug: string };

export function initialViewState(): ViewState {
  return { view: { kind: "templates" }, sessionMemory: new Map() };
}

type SessionMemory = ReadonlyMap<string, string>;

function rememberSession(
  memory: SessionMemory,
  slug: string,
  sessionId: string | null,
): SessionMemory {
  if (sessionId === null || memory.get(slug) === sessionId) return memory;
  return new Map(memory).set(slug, sessionId);
}

function forgetSession(memory: SessionMemory, slug: string): SessionMemory {
  if (!memory.has(slug)) return memory;
  const next = new Map(memory);
  next.delete(slug);
  return next;
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "OPEN_TEMPLATES":
      if (state.view.kind === "templates") return state;
      return { ...state, view: { kind: "templates" } };

    case "OPEN_SETTINGS": {
      const tab: SettingsTab = action.tab ?? "appearance";
      if (state.view.kind === "settings" && state.view.tab === tab) return state;
      return { ...state, view: { kind: "settings", tab } };
    }

    case "OPEN_PROJECT": {
      const session =
        action.session !== undefined
          ? action.session
          : (state.sessionMemory.get(action.slug) ?? null);
      return {
        view: { kind: "project", slug: action.slug, session, mode: "chat" },
        sessionMemory: rememberSession(state.sessionMemory, action.slug, session),
      };
    }

    case "OPEN_SESSION": {
      if (state.view.kind !== "project") return state;
      if (state.view.session === action.sessionId) return state;
      return {
        view: { ...state.view, session: action.sessionId },
        sessionMemory: rememberSession(state.sessionMemory, state.view.slug, action.sessionId),
      };
    }

    case "SET_VIEW_MODE": {
      if (state.view.kind !== "project") return state;
      if (state.view.mode === action.mode) return state;
      return { ...state, view: { ...state.view, mode: action.mode } };
    }

    case "FORGET_PROJECT": {
      const isActive =
        state.view.kind === "project" && state.view.slug === action.slug;
      const nextMemory = forgetSession(state.sessionMemory, action.slug);
      if (!isActive && nextMemory === state.sessionMemory) return state;
      return {
        view: isActive ? { kind: "templates" } : state.view,
        sessionMemory: nextMemory,
      };
    }

    default:
      return state;
  }
}

// --- Selectors ---

/** Active project slug or null if the view is not a project view. */
export function selectActiveProjectSlug(state: ViewState): string | null {
  return state.view.kind === "project" ? state.view.slug : null;
}

/** Active session id or null if no project view / no session selected. */
export function selectActiveSessionId(state: ViewState): string | null {
  return state.view.kind === "project" ? state.view.session : null;
}
