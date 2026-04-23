import { json, BASE } from "@/client/shared/api.js";
import type { Session, TreeNode } from "./session.types.js";

// --- Sessions ---

function projectBase(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}/sessions`;
}

export function fetchSessions(projectSlug: string): Promise<Session[]> {
  return json(projectBase(projectSlug));
}

export function createSession(
  projectSlug: string,
  mode?: "creative" | "meta",
): Promise<{ session: Session }> {
  return json(projectBase(projectSlug), {
    method: "POST",
    ...(mode && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  });
}

export function fetchSession(projectSlug: string, id: string): Promise<{
  session: Session;
  nodes: TreeNode[];
  activePath: string[];
}> {
  return json(`${projectBase(projectSlug)}/${id}`);
}

export function deleteSession(projectSlug: string, id: string): Promise<void> {
  return json(`${projectBase(projectSlug)}/${id}`, { method: "DELETE" });
}

export function deleteNode(
  projectSlug: string,
  sessionId: string,
  nodeId: string,
): Promise<{ activePath: string[]; activeLeafId: string; rootNodeId: string }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/nodes/${nodeId}`, {
    method: "DELETE",
  });
}

export function switchBranch(
  projectSlug: string,
  sessionId: string,
  nodeId: string,
): Promise<{ activePath: string[]; activeLeafId: string }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId }),
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "DOMException");
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const b = await res.json();
        if (b?.error) detail = b.error;
      } catch {
        /* use default */
      }
      throw new Error(detail);
    }
  } catch (err) {
    // Aborted fetches are expected on user cancel / project delete.
    if (isAbortError(err) || signal?.aborted) return;
    throw err;
  }
}

// --- Abort control (module-scope registry) ---

/**
 * Per-project AbortControllers. There is at most one active stream per project
 * (enforced by the useStreaming guard), so projectSlug is a sufficient key.
 *
 * Module scope (not React state) because:
 *   - consumers across features/entities need to cancel
 *   - AbortController itself is mutable and not a serializable state value
 */
const abortControllers = new Map<string, AbortController>();

export function registerAbortController(projectSlug: string, controller: AbortController): void {
  // If a previous controller is somehow still registered, abort it first
  // (defensive — shouldn't happen under normal flow due to isStreaming guard).
  abortControllers.get(projectSlug)?.abort();
  abortControllers.set(projectSlug, controller);
}

export function clearAbortController(projectSlug: string, controller: AbortController): void {
  // Only clear if the registered controller still matches; otherwise a new
  // stream started between the old one finishing and cleanup running.
  if (abortControllers.get(projectSlug) === controller) {
    abortControllers.delete(projectSlug);
  }
}

/** Abort the in-flight stream for a given project, if any. No-op if none. */
export function abortProjectStream(projectSlug: string): void {
  const controller = abortControllers.get(projectSlug);
  if (controller) {
    controller.abort();
    abortControllers.delete(projectSlug);
  }
}

export function sendMessage(
  projectSlug: string,
  sessionId: string,
  parentNodeId: string | null,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  return postJson(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/messages`,
    { parentNodeId, text },
    signal,
  );
}

export function regenerateResponse(
  projectSlug: string,
  sessionId: string,
  userNodeId: string,
  signal?: AbortSignal,
): Promise<void> {
  return postJson(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/regenerate`,
    { userNodeId },
    signal,
  );
}

// --- Compact ---

export function compactSession(
  projectSlug: string,
  sessionId: string,
): Promise<{ session: Session; nodes: TreeNode[]; sourceSessionId: string }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/compact`, {
    method: "POST",
  });
}
