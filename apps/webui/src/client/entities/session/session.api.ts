import type { AgentEvent } from "@agentchan/creative-agent";
import { json, parseSSEStream, BASE } from "@/client/shared/api.js";
import type { SessionEntry, SessionMode } from "@agentchan/creative-agent";

export type { AgentEvent };

// --- Sessions ---

function projectBase(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}/sessions`;
}

export function fetchSessions(projectSlug: string): Promise<Array<{
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider: string;
  model: string;
  compactedFrom?: string;
  mode?: SessionMode;
}>> {
  return json(projectBase(projectSlug));
}

export function createSession(
  projectSlug: string,
  mode?: SessionMode,
): Promise<{ session: Awaited<ReturnType<typeof fetchSessions>>[number] }> {
  return json(projectBase(projectSlug), {
    method: "POST",
    ...(mode && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  });
}

export function fetchSession(projectSlug: string, id: string, leafId?: string | null): Promise<{
  entries: SessionEntry[];
  leafId: string | null;
}> {
  const query = leafId ? `?leafId=${encodeURIComponent(leafId)}` : "";
  return json(`${projectBase(projectSlug)}/${id}${query}`);
}

export function deleteSession(projectSlug: string, id: string): Promise<void> {
  return json(`${projectBase(projectSlug)}/${id}`, { method: "DELETE" });
}

export function renameSession(
  projectSlug: string,
  id: string,
  name: string,
): Promise<{
  entries: SessionEntry[];
  leafId: string | null;
}> {
  return json(`${projectBase(projectSlug)}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// --- SSE Message Stream ---

export interface SSECallbacks {
  onUserEntries: (entries: SessionEntry[]) => void;
  onAgentEvent: (event: AgentEvent) => void;
  onAssistantEntries: (entries: SessionEntry[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function handleSSEEvent(event: string, data: string, callbacks: SSECallbacks): void {
  try {
    switch (event) {
      case "user_entries":
        callbacks.onUserEntries(JSON.parse(data));
        break;
      case "agent_event":
        callbacks.onAgentEvent(JSON.parse(data));
        break;
      case "assistant_entries":
        callbacks.onAssistantEntries(JSON.parse(data));
        break;
      case "done":
        callbacks.onDone();
        break;
      case "error": {
        const parsed = data ? JSON.parse(data) : { message: "Unknown error" };
        callbacks.onError(parsed.message);
        break;
      }
    }
  } catch (e) {
    console.error("SSE parse error:", e, event, data);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "DOMException");
}

async function postSSE(
  url: string,
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try { const b = await res.json(); if (b?.error) detail = b.error; } catch { /* use default */ }
      callbacks.onError(detail);
      return;
    }

    await parseSSEStream(res.body, (event, data) =>
      handleSSEEvent(event, data, callbacks),
    );
  } catch (err) {
    // Aborted fetches are expected on user cancel / project delete — don't surface as error.
    if (isAbortError(err) || signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : String(err));
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
  leafId: string | null,
  text: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/messages`,
    { leafId, text },
    callbacks,
    signal,
  );
}

export function regenerateResponse(
  projectSlug: string,
  sessionId: string,
  entryId: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/regenerate`,
    { entryId },
    callbacks,
    signal,
  );
}

// --- Compact ---

export function compactSession(
  projectSlug: string,
  sessionId: string,
  leafId?: string | null,
): Promise<{ entries: SessionEntry[]; leafId: string | null; compactionEntryId: string }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/compact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leafId }),
  });
}
