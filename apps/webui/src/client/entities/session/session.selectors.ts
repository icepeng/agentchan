import type { AgentchanSessionInfo } from "@agentchan/creative-agent/session";

export {
  buildSiblingsByEntry,
  defaultLeafId,
  selectBranch,
  selectBranchMessages,
  selectMessageEntries,
  selectSiblings,
} from "@agentchan/creative-agent/session";

/**
 * Most recent creative session id from a server-sorted list, or null if no
 * creative session exists. Server lists `modified desc`, so the first creative
 * entry is the right default. Meta sessions are explicit auxiliary workspaces
 * and are not selected automatically on project entry.
 */
export function pickDefaultCreativeSessionId(
  sessions: ReadonlyArray<AgentchanSessionInfo>,
): string | null {
  return sessions.find((s) => s.mode === "creative")?.id ?? null;
}
