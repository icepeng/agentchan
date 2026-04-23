/**
 * Tell the server which session is "current" for a project. The server
 * rebuilds AgentState from that session's activePath and broadcasts a fresh
 * `snapshot` event to all SSE subscribers. Pass `sessionId: null` to clear
 * the slot (e.g. last session deleted).
 */
export async function hydrateState(
  projectSlug: string,
  sessionId: string | null,
): Promise<void> {
  await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/state/hydrate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}
