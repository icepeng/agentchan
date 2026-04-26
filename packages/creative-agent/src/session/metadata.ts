import type { CustomEntry, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { SessionMode } from "../types.js";

export const AGENTCHAN_SESSION_TYPE = "agentchan.session";

export function getSessionModeFromEntries(
  entries: readonly SessionEntry[],
): SessionMode | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry.customType !== AGENTCHAN_SESSION_TYPE) {
      continue;
    }
    const data = (entry as CustomEntry<{ mode?: SessionMode }>).data;
    if (data?.mode) return data.mode;
  }
  return undefined;
}
