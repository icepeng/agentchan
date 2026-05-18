import { useViewDispatch, useViewState } from "./view/ViewContext.js";
import type { ChromeUIAction, ViewAction } from "./view/viewReducer.js";

export function useView() {
  const state = useViewState();
  const dispatch = useViewDispatch();

  return {
    view: state.view,
    sidebarOpen: state.sidebarOpen,
    readmeOpen: state.readmeOpen,
    activeProjectSlug: state.view.kind === "project" ? state.view.slug : null,
    activeSessionId: state.view.kind === "project" ? state.view.session : null,
    getRememberedSession: (slug: string) => state.sessionMemory.get(slug) ?? null,
    dispatch: dispatch as (action: ViewAction | ChromeUIAction) => void,
  };
}
