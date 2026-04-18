import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useSessionSelectionState,
  selectSessionSelection,
  type SessionSelection,
} from "./SessionSelectionContext.js";

export function useActiveSessionSelection(): SessionSelection {
  const { activeProjectSlug } = useProjectSelectionState();
  const state = useSessionSelectionState();
  return selectSessionSelection(state, activeProjectSlug);
}
