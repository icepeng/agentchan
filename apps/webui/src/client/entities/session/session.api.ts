import type {
  AgentEvent,
  AgentchanSessionInfo,
  SessionEntry,
  SessionMode,
} from "@agentchan/creative-agent";
import { json, parseSSEStream, BASE } from "@/client/shared/api.js";

export type { AgentEvent };

// --- Sessions ---

function projectBase(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}/sessions`;
}

export function fetchSessions(projectSlug: string): Promise<AgentchanSessionInfo[]> {
  return json(projectBase(projectSlug));
}

export function createSession(
  projectSlug: string,
  mode?: SessionMode,
): Promise<AgentchanSessionInfo> {
  return json(projectBase(projectSlug), {
    method: "POST",
    ...(mode && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  });
}

export interface SessionDetailResponse {
  info: AgentchanSessionInfo;
  entries: SessionEntry[];
  leafId: string | null;
}

export function fetchSession(
  projectSlug: string,
  id: string,
  leafId?: string | null,
): Promise<SessionDetailResponse> {
  const qs = leafId ? `?leafId=${encodeURIComponent(leafId)}` : "";
  return json(`${projectBase(projectSlug)}/${id}${qs}`);
}

export function deleteSession(projectSlug: string, id: string): Promise<void> {
  return json(`${projectBase(projectSlug)}/${id}`, { method: "DELETE" });
}

export function renameSession(
  projectSlug: string,
  sessionId: string,
  leafId: string | null,
  name: string,
): Promise<{ entry: SessionEntry }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leafId, name }),
  });
}

// --- SSE Message Stream ---

export interface SSECallbacks {
  onEntries: (entries: SessionEntry[]) => void;
  onAgentEvent: (event: AgentEvent) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function handleSSEEvent(event: string, data: string, callbacks: SSECallbacks): void {
  try {
    switch (event) {
      case "entries_persisted":
        callbacks.onEntries(JSON.parse(data));
        break;
      case "agent_event":
        callbacks.onAgentEvent(JSON.parse(data));
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
    if (isAbortError(err) || signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : String(err));
  }
}

// --- Abort control (module-scope registry) ---

const abortControllers = new Map<string, AbortController>();

export function registerAbortController(projectSlug: string, controller: AbortController): void {
  abortControllers.get(projectSlug)?.abort();
  abortControllers.set(projectSlug, controller);
}

export function clearAbortController(projectSlug: string, controller: AbortController): void {
  if (abortControllers.get(projectSlug) === controller) {
    abortControllers.delete(projectSlug);
  }
}

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

export interface CompactResponse {
  info: AgentchanSessionInfo;
  compactionEntry: SessionEntry;
  newLeafId: string;
}

export function compactSession(
  projectSlug: string,
  sessionId: string,
  leafId?: string | null,
): Promise<CompactResponse> {
  return json(`${projectBase(projectSlug)}/${sessionId}/compact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leafId: leafId ?? null }),
  });
}
