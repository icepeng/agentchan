import type {
  AssistantMessageEvent,
  ImageContent,
  TextContent,
} from "@mariozechner/pi-ai";
import { json, parseSSEStream, BASE } from "@/client/shared/api.js";
import type { TokenUsage } from "@/client/shared/pricing.utils.js";
import type { Session, TreeNode } from "./session.types.js";

export type { AssistantMessageEvent };

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

// --- SSE Message Stream ---

/**
 * Mirror pi `ToolResultMessage.content` shape so the synthesized in-flight
 * `ToolResultMessage` matches the canonical pi envelope.
 */
export type ToolResultContent = (TextContent | ImageContent)[];

export interface SSECallbacks {
  onUserNode: (node: TreeNode) => void;
  onAssistantEvent: (event: AssistantMessageEvent) => void;
  onToolExecStart: (id: string, name: string, args: unknown) => void;
  onToolExecEnd: (id: string, name: string, isError: boolean, content: ToolResultContent) => void;
  onUsageSummary: (usage: TokenUsage) => void;
  onAssistantNodes: (nodes: TreeNode[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function handleSSEEvent(event: string, data: string, callbacks: SSECallbacks): void {
  try {
    switch (event) {
      case "user_node":
        callbacks.onUserNode(JSON.parse(data));
        break;
      case "assistant_event":
        callbacks.onAssistantEvent(JSON.parse(data));
        break;
      case "tool_exec_start": {
        const parsed = JSON.parse(data);
        callbacks.onToolExecStart(parsed.id, parsed.name, parsed.args);
        break;
      }
      case "tool_exec_end": {
        const parsed = JSON.parse(data);
        callbacks.onToolExecEnd(parsed.id, parsed.name, parsed.is_error, parsed.content ?? []);
        break;
      }
      case "usage_summary": {
        callbacks.onUsageSummary(JSON.parse(data));
        break;
      }
      case "assistant_nodes":
        callbacks.onAssistantNodes(JSON.parse(data));
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
  parentNodeId: string | null,
  text: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/messages`,
    { parentNodeId, text },
    callbacks,
    signal,
  );
}

export function regenerateResponse(
  projectSlug: string,
  sessionId: string,
  userNodeId: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${sessionId}/regenerate`,
    { userNodeId },
    callbacks,
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
