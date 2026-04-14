import { json, parseSSEStream, BASE } from "@/client/shared/api.js";
import type { TokenUsage } from "@/client/shared/pricing.utils.js";
import type { Conversation, TreeNode } from "./session.types.js";

// --- Conversations ---

function projectBase(projectSlug: string): string {
  return `/projects/${encodeURIComponent(projectSlug)}/conversations`;
}

export function fetchConversations(projectSlug: string): Promise<Conversation[]> {
  return json(projectBase(projectSlug));
}

export function createConversation(
  projectSlug: string,
  mode?: "creative" | "meta",
): Promise<{ conversation: Conversation; nodes: TreeNode[] }> {
  return json(projectBase(projectSlug), {
    method: "POST",
    ...(mode && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  });
}

export function fetchConversation(projectSlug: string, id: string): Promise<{
  conversation: Conversation;
  nodes: TreeNode[];
  activePath: string[];
}> {
  return json(`${projectBase(projectSlug)}/${id}`);
}

export function deleteConversation(projectSlug: string, id: string): Promise<void> {
  return json(`${projectBase(projectSlug)}/${id}`, { method: "DELETE" });
}

export function deleteNode(
  projectSlug: string,
  conversationId: string,
  nodeId: string,
): Promise<{ activePath: string[]; activeLeafId: string; rootNodeId: string }> {
  return json(`${projectBase(projectSlug)}/${conversationId}/nodes/${nodeId}`, {
    method: "DELETE",
  });
}

export function switchBranch(
  projectSlug: string,
  conversationId: string,
  nodeId: string,
): Promise<{ activePath: string[]; activeLeafId: string }> {
  return json(`${projectBase(projectSlug)}/${conversationId}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId }),
  });
}

// --- SSE Message Stream ---

export interface SSECallbacks {
  onUserNode: (node: TreeNode) => void;
  onTextDelta: (text: string) => void;
  onToolUseStart: (id: string, name: string) => void;
  onToolUseDelta: (id: string, inputJson: string) => void;
  onToolUseEnd: (id: string) => void;
  onToolExecStart: (id: string, name: string, parallel: boolean) => void;
  onToolExecEnd: (id: string, isError: boolean) => void;
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
      case "text_delta": {
        const parsed = JSON.parse(data);
        callbacks.onTextDelta(parsed.text);
        break;
      }
      case "tool_use_start": {
        const parsed = JSON.parse(data);
        callbacks.onToolUseStart(parsed.id, parsed.name);
        break;
      }
      case "tool_use_delta": {
        const parsed = JSON.parse(data);
        callbacks.onToolUseDelta(parsed.id, parsed.input_json);
        break;
      }
      case "tool_use_end": {
        const parsed = JSON.parse(data);
        callbacks.onToolUseEnd(parsed.id);
        break;
      }
      case "tool_exec_start": {
        const parsed = JSON.parse(data);
        callbacks.onToolExecStart(parsed.id, parsed.name, parsed.parallel);
        break;
      }
      case "tool_exec_end": {
        const parsed = JSON.parse(data);
        callbacks.onToolExecEnd(parsed.id, parsed.is_error);
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
  conversationId: string,
  parentNodeId: string | null,
  text: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${conversationId}/messages`,
    { parentNodeId, text },
    callbacks,
    signal,
  );
}

export function regenerateResponse(
  projectSlug: string,
  conversationId: string,
  userNodeId: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}${projectBase(projectSlug)}/${conversationId}/regenerate`,
    { userNodeId },
    callbacks,
    signal,
  );
}

// --- Compact ---

export function compactConversation(
  projectSlug: string,
  conversationId: string,
): Promise<{ conversation: Conversation; nodes: TreeNode[]; sourceConversationId: string }> {
  return json(`${projectBase(projectSlug)}/${conversationId}/compact`, {
    method: "POST",
  });
}
