import type { SSEStreamingApi } from "hono/streaming";
import type {
  AgentEvent,
  AgentContext,
  AgentMessage,
  TreeNode,
  TreeNodeWithChildren,
} from "@agentchan/creative-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";

/**
 * Server-authoritative AgentState shape — mirrors
 * `apps/webui/public/types/renderer.d.ts`. The wire format uses a plain array
 * for `pendingToolCalls` so SSE JSON encoding is round-trip safe.
 */
export interface AgentStateSnapshot {
  messages: AgentMessage[];
  streamingMessage?: AssistantMessage;
  pendingToolCalls: string[];
  isStreaming: boolean;
  errorMessage?: string;
}

const EMPTY_SNAPSHOT: AgentStateSnapshot = {
  messages: [],
  pendingToolCalls: [],
  isStreaming: false,
};

interface Slot {
  snapshot: AgentStateSnapshot;
  currentSessionId: string | null;
  subscribers: Set<SSEStreamingApi>;
}

/**
 * Single source of truth for AgentState per project. The iframe renderer and
 * the host AgentPanel both subscribe to the same SSE channel; push events
 * flow:
 *
 *   pi Agent → runPrompt callback → agent.service forwards → state.service.applyAgentEvent
 *   → patch snapshot + broadcast patch event to all subscribers.
 *
 * The host also routes action RPC side-effects through broadcast:
 *   fill/setTheme actions → state.service.fillInput/setTheme → fill_input /
 *   theme_changed events (consumed only by host React).
 */
export function createStateService(ctx: AgentContext) {
  const slots = new Map<string, Slot>();

  function getOrCreate(slug: string): Slot {
    let slot = slots.get(slug);
    if (!slot) {
      slot = {
        snapshot: EMPTY_SNAPSHOT,
        currentSessionId: null,
        subscribers: new Set(),
      };
      slots.set(slug, slot);
    }
    return slot;
  }

  async function broadcast(
    slug: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const slot = slots.get(slug);
    if (!slot) return;
    const payload = {
      event,
      data: data === undefined ? "" : JSON.stringify(data),
    };
    const dead: SSEStreamingApi[] = [];
    await Promise.all(
      Array.from(slot.subscribers).map(async (sub) => {
        try {
          await sub.writeSSE(payload);
        } catch {
          dead.push(sub);
        }
      }),
    );
    for (const d of dead) slot.subscribers.delete(d);
  }

  async function sendSnapshot(
    stream: SSEStreamingApi,
    snapshot: AgentStateSnapshot,
  ): Promise<void> {
    await stream.writeSSE({
      event: "snapshot",
      data: JSON.stringify({ state: snapshot }),
    });
  }

  function snapshotFromActivePath(
    activePath: string[],
    tree: Map<string, TreeNodeWithChildren>,
  ): AgentStateSnapshot {
    const messages: AgentMessage[] = [];
    for (const id of activePath) {
      const node = tree.get(id);
      if (!node) continue;
      if (node.meta === "compact-summary") continue;
      messages.push(node.message);
    }
    return {
      messages,
      pendingToolCalls: [],
      isStreaming: false,
    };
  }

  return {
    async subscribe(slug: string, stream: SSEStreamingApi): Promise<void> {
      const slot = getOrCreate(slug);
      slot.subscribers.add(stream);
      await sendSnapshot(stream, slot.snapshot);
    },

    unsubscribe(slug: string, stream: SSEStreamingApi): void {
      slots.get(slug)?.subscribers.delete(stream);
    },

    /**
     * Called on session open / switch. Replaces snapshot from disk and
     * re-broadcasts. Streaming takes precedence: if a live stream is active
     * for the same project, hydrate is a no-op (events are authoritative).
     */
    async hydrate(slug: string, sessionId: string | null): Promise<void> {
      const slot = getOrCreate(slug);
      if (slot.snapshot.isStreaming && sessionId === slot.currentSessionId) {
        return;
      }
      if (sessionId === null) {
        slot.currentSessionId = null;
        slot.snapshot = EMPTY_SNAPSHOT;
      } else {
        const loaded = await ctx.storage.loadSessionWithTree(slug, sessionId);
        if (!loaded) {
          slot.currentSessionId = null;
          slot.snapshot = EMPTY_SNAPSHOT;
        } else {
          slot.currentSessionId = sessionId;
          slot.snapshot = snapshotFromActivePath(loaded.activePath, loaded.tree);
        }
      }
      await broadcast(slug, "snapshot", { state: slot.snapshot });
    },

    /**
     * Drop in-memory snapshot + disconnect subscribers. Called on project
     * delete so that a future project with the same slug starts clean.
     */
    async purge(slug: string): Promise<void> {
      const slot = slots.get(slug);
      if (!slot) return;
      for (const sub of slot.subscribers) {
        try {
          await sub.close();
        } catch {
          /* ignore */
        }
      }
      slots.delete(slug);
    },

    applyAgentEvent(slug: string, ev: AgentEvent): void {
      const slot = getOrCreate(slug);
      const before = slot.snapshot;
      let next: AgentStateSnapshot = before;

      switch (ev.type) {
        case "agent_start":
          next = {
            ...before,
            isStreaming: true,
            streamingMessage: undefined,
            errorMessage: undefined,
          };
          break;
        case "agent_end":
          next = { ...before, isStreaming: false, streamingMessage: undefined };
          break;
        case "message_start":
        case "message_update":
          if (ev.message.role === "assistant") {
            next = { ...before, streamingMessage: ev.message };
          }
          break;
        case "message_end":
          next = {
            ...before,
            streamingMessage: undefined,
            messages: [...before.messages, ev.message],
          };
          break;
        case "tool_execution_start": {
          if (!before.pendingToolCalls.includes(ev.toolCallId)) {
            next = {
              ...before,
              pendingToolCalls: [...before.pendingToolCalls, ev.toolCallId],
            };
          }
          break;
        }
        case "tool_execution_end": {
          if (before.pendingToolCalls.includes(ev.toolCallId)) {
            next = {
              ...before,
              pendingToolCalls: before.pendingToolCalls.filter(
                (id) => id !== ev.toolCallId,
              ),
            };
          }
          break;
        }
        case "turn_end":
          if (ev.message.role === "assistant" && ev.message.errorMessage) {
            next = { ...before, errorMessage: ev.message.errorMessage };
          }
          break;
      }

      if (next === before) return;
      slot.snapshot = next;

      // Emit granular patch events. Keeping them small so the wire stays
      // light even during token-dense streaming.
      switch (ev.type) {
        case "agent_start":
          void broadcast(slug, "agent_start", {});
          break;
        case "agent_end":
          void broadcast(slug, "streaming_clear", {});
          break;
        case "message_start":
        case "message_update":
          if (ev.message.role === "assistant") {
            void broadcast(slug, "streaming", { message: ev.message });
          }
          break;
        case "message_end":
          void broadcast(slug, "append", { message: ev.message });
          void broadcast(slug, "streaming_clear", {});
          break;
        case "tool_execution_start":
        case "tool_execution_end":
          void broadcast(slug, "tool_pending_set", {
            ids: next.pendingToolCalls,
          });
          break;
        case "turn_end":
          if (ev.message.role === "assistant" && ev.message.errorMessage) {
            void broadcast(slug, "error", { message: ev.message.errorMessage });
          }
          break;
      }
    },

    /**
     * User message appended client-side (send action). We echo it through the
     * same append channel so iframe renderers that chose to ignore the
     * user-input UX still see the message in `state.messages`.
     */
    applyUserNode(slug: string, node: TreeNode): void {
      const slot = getOrCreate(slug);
      slot.snapshot = {
        ...slot.snapshot,
        messages: [...slot.snapshot.messages, node.message],
      };
      void broadcast(slug, "append", { message: node.message });
    },

    applyError(slug: string, message: string): void {
      const slot = getOrCreate(slug);
      slot.snapshot = {
        ...slot.snapshot,
        isStreaming: false,
        streamingMessage: undefined,
        errorMessage: message,
      };
      void broadcast(slug, "error", { message });
    },

    fillInput(slug: string, text: string): void {
      void broadcast(slug, "fill_input", { text });
    },

    setTheme(slug: string, theme: unknown): void {
      void broadcast(slug, "theme_changed", { theme });
    },

    isStreaming(slug: string): boolean {
      return slots.get(slug)?.snapshot.isStreaming === true;
    },

    currentSessionId(slug: string): string | null {
      return slots.get(slug)?.currentSessionId ?? null;
    },
  };
}

export type StateService = ReturnType<typeof createStateService>;
