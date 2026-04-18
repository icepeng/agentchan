import { useEffect, useRef } from "react";
import { useProjectSelectionDispatch, useProjects } from "@/client/entities/project/index.js";
import { localStore } from "@/client/shared/storage.js";

import { AppShell } from "@/client/app/index.js";

export function App() {
  const projectDispatch = useProjectSelectionDispatch();
  const { data: projects } = useProjects();
  const decidedRef = useRef(false);

  // Once SWR resolves the project list, restore the last-active slug. Skills,
  // sessions, and config are all SWR-driven now — any consumer that
  // mounts a `useSkills(slug)` / `useSessions(slug)` triggers its own
  // fetch. Run exactly once: subsequent SWR refetches must not re-bootstrap
  // or reset the user's active project.
  useEffect(() => {
    if (decidedRef.current || !projects) return;
    decidedRef.current = true;

    const lastSlug = localStore.lastProject.read();
    const defaultProject = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0];
    if (!defaultProject) return;

    projectDispatch({ type: "SET_ACTIVE_PROJECT", slug: defaultProject.slug });
  }, [projects, projectDispatch]);

  return <AppShell />;
}
