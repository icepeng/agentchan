import type { CustomEntry, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { SessionMode } from "../types.js";

export const AGENTCHAN_SESSION_TYPE = "agentchan.session";

export function getSessionModeFromEntries(
  entries: readonly SessionEntry[],
): SessionMode | undefined {
  // Agentchan writes this once during session creation; treat the first entry as the invariant.
  for (const entry of entries) {
    if (entry?.type !== "custom" || entry.customType !== AGENTCHAN_SESSION_TYPE) {
      continue;
    }
    const data = (entry as CustomEntry<{ mode?: SessionMode }>).data;
    if (data?.mode) return data.mode;
  }
  return undefined;
}
