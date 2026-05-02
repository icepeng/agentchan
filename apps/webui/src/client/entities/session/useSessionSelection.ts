import {
  useViewState,
  selectActiveSessionId,
} from "@/client/entities/view/index.js";
import { useSessionSelectionState } from "./SessionSelectionContext.js";

export interface ActiveSessionSelection {
  openSessionId: string | null;
  replyToEntryId: string | null;
}

/**
 * Composite read for code that wants both the active session id (from the
 * view) and the per-session reply anchor (from SessionSelectionContext) in
 * one shape. ADR-0009: openSessionId is view-determining; replyToEntryId is
 * session-internal.
 */
export function useActiveSessionSelection(): ActiveSessionSelection {
  const view = useViewState();
  const { replyToEntryId } = useSessionSelectionState();
  return {
    openSessionId: selectActiveSessionId(view),
    replyToEntryId,
  };
}
