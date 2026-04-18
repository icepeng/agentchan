import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useStreamState, selectStreamSlot } from "./StreamContext.js";
import type { StreamSlot } from "./stream.types.js";

export function useActiveStream(): StreamSlot {
  const { activeProjectSlug } = useProjectSelectionState();
  const state = useStreamState();
  return selectStreamSlot(state, activeProjectSlug);
}
