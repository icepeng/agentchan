import type { AgentEvent, SwitchBranchResult } from "@agentchan/creative-agent";
import { json, parseSSEStream, BASE } from "@/client/shared/api.js";
import type {
  ProjectSessionInfo,
  ProjectSessionState,
  SessionEntry,
} from "./session.types.js";

export type { AgentEvent };

function projectBase(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}/sessions`;
}

export function fetchSessions(projectSlug: string): Promise<ProjectSessionInfo[]> {
  return json(projectBase(projectSlug));
}

export function createSession(
  projectSlug: string,
  mode?: "creative" | "meta",
): Promise<{ session: ProjectSessionInfo }> {
  return json(projectBase(projectSlug), {
    method: "POST",
    ...(mode && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  });
}

export function fetchSession(
  projectSlug: string,
  id: string,
): Promise<ProjectSessionState> {
  return json(`${projectBase(projectSlug)}/${id}`);
}

export function deleteSession(projectSlug: string, id: string): Promise<void> {
  return json(`${projectBase(projectSlug)}/${id}`, { method: "DELETE" });
}

export function switchBranch(
  projectSlug: string,
  sessionId: string,
  entryId: string,
): Promise<SwitchBranchResult> {
  return json(`${projectBase(projectSlug)}/${sessionId}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryId }),
  });
}

export interface SSECallbacks {
  onEntry: (entry: SessionEntry) => void;
  onAgentEvent: (event: AgentEvent) => void;
  onSnapshot: (snapshot: ProjectSessionState) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function handleSSEEvent(event: string, data: string, callbacks: SSECallbacks): void {
  try {
    switch (event) {
      case "entry":
        callbacks.onEntry(JSON.parse(data));
        break;
      case "agent_event":
        callbacks.onAgentEvent(JSON.parse(data));
        break;
      case "snapshot":
        callbacks.onSnapshot(JSON.parse(data));
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
  parentEntryId: string | null,
  text: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/messages`,
    { parentEntryId, text },
    callbacks,
    signal,
  );
}

export function regenerateResponse(
  projectSlug: string,
  sessionId: string,
  userEntryId: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/regenerate`,
    { userEntryId },
    callbacks,
    signal,
  );
}

export function compactSession(
  projectSlug: string,
  sessionId: string,
): Promise<{ state: ProjectSessionState; sourceSessionId: string }> {
  return json(`${projectBase(projectSlug)}/${sessionId}/compact`, {
    method: "POST",
  });
}
