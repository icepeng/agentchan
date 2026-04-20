import { useProjectSelectionState } from "./ProjectSelectionContext.js";
import { useProjects } from "./useProjects.js";
import type { Project } from "./project.types.js";

/**
 * 현재 활성화된 프로젝트 객체를 반환한다. slug만 필요하면 `useProjectSelectionState`를 쓰고,
 * intent나 name 같은 프로젝트 메타가 필요할 때 이 훅을 쓴다.
 */
export function useActiveProject(): Project | null {
  const { activeProjectSlug } = useProjectSelectionState();
  const { data: projects = [] } = useProjects();
  if (!activeProjectSlug) return null;
  return projects.find((p) => p.slug === activeProjectSlug) ?? null;
}
