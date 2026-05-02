import { useEffect, useRef } from "react";
import {
  useViewState,
  selectActiveSessionId,
} from "@/client/entities/view/index.js";
import { useProjects } from "@/client/entities/project/index.js";
import { useSessionSelectionDispatch } from "@/client/entities/session/index.js";
import { useProject } from "@/client/features/project/index.js";
import { localStore } from "@/client/shared/storage.js";

import { AppShell } from "@/client/app/index.js";

export function App() {
  const view = useViewState();
  const sessionSelectionDispatch = useSessionSelectionDispatch();
  const { data: projects } = useProjects();
  const { selectProject } = useProject();
  const decidedRef = useRef(false);

  // Once SWR resolves the project list, restore the last-active slug. Route
  // through `selectProject` so the same "remembered session, else default
  // creative" policy applies to cold boot. Run exactly once: subsequent SWR
  // refetches must not re-bootstrap or reset the user's active project.
  useEffect(() => {
    if (decidedRef.current || !projects) return;
    decidedRef.current = true;

    const lastSlug = localStore.lastProject.read();
    const defaultProject = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0];
    if (!defaultProject) return;

    void selectProject(defaultProject.slug);
  }, [projects, selectProject]);

  // Reply anchor lifetime is per-session: clear it whenever the active session
  // changes (including project switches that change the session by extension).
  // Reducer-side this lives outside ViewContext because the anchor is a
  // session-internal concept, not view-determining (ADR-0009).
  const activeSessionId = selectActiveSessionId(view);
  useEffect(() => {
    sessionSelectionDispatch({ type: "SET_REPLY_TO", entryId: null });
  }, [activeSessionId, sessionSelectionDispatch]);

  return <AppShell />;
}
