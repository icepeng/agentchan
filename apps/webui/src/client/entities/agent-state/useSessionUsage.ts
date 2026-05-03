import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import {
  useSessionData,
  useActiveSessionSelection,
  selectMessageEntries,
} from "@/client/entities/session/index.js";
import {
  aggregateUsage,
  EMPTY_AGGREGATED_USAGE,
  type AggregatedUsage,
} from "./aggregateUsage.js";

/**
 * **Session usage** — token + cost totals over *every* persisted assistant
 * **Session entry** in the active **Session** file. **Branch** selection is
 * irrelevant; discarded **Branch** entries still count because their LLM
 * calls were already billed (ADR-0012).
 */
export function useSessionUsage(): AggregatedUsage {
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const { openSessionId } = useActiveSessionSelection();
  const { data } = useSessionData(activeProjectSlug, openSessionId);
  if (!data) return EMPTY_AGGREGATED_USAGE;
  const messageEntries = selectMessageEntries(data.entries);
  return aggregateUsage(messageEntries);
}
