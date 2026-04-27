import type { SSEStreamingApi } from "hono/streaming";
import {
  type AgentContext,
  type SessionEvent,
  runPrompt,
  runRegenerate,
} from "@agentchan/creative-agent";

/**
 * SSE adapter — forwards pi `AgentEvent` raw under the single `agent_event`
 * wire name and emits `entries_persisted` for any new SessionEntry rows the
 * server appends (user drafts, then assistant-side messages after the turn).
 */
export function createAgentService(
  ctx: AgentContext,
  prepareRun: () => Promise<void> = async () => {},
) {
  return {
    async sendMessage(
      stream: SSEStreamingApi,
      slug: string,
      sessionId: string,
      leafId: string | null,
      text: string,
      signal?: AbortSignal,
    ) {
      await prepareRun();
      const queue = createSerialWriter(stream);
      try {
        await runPrompt(
          ctx,
          { slug, sessionId, leafId, text },
          (ev) => queue.push(ev),
          signal,
        );
      } finally {
        await queue.drain();
      }
    },

    async regenerate(
      stream: SSEStreamingApi,
      slug: string,
      sessionId: string,
      entryId: string,
      signal?: AbortSignal,
    ) {
      await prepareRun();
      const queue = createSerialWriter(stream);
      try {
        await runRegenerate(
          ctx,
          { slug, sessionId, entryId },
          (ev) => queue.push(ev),
          signal,
        );
      } finally {
        await queue.drain();
      }
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;

// --- Event → SSE serialization ---

/**
 * Session listeners are sync (called from inside Agent's sync subscribe loop).
 * SSE writes are async. We need a serial queue so back-to-back events
 * don't interleave on the wire.
 */
function createSerialWriter(stream: SSEStreamingApi) {
  let chain: Promise<void> = Promise.resolve();
  function push(ev: SessionEvent): void {
    chain = chain.then(() => writeSessionEvent(stream, ev)).catch((err) => {
      console.error("[agent.service] SSE write failed", err);
    });
  }
  function drain(): Promise<void> {
    return chain;
  }
  return { push, drain };
}

async function writeSessionEvent(
  stream: SSEStreamingApi,
  ev: SessionEvent,
): Promise<void> {
  switch (ev.type) {
    case "entries_persisted":
      await stream.writeSSE({
        event: "entries_persisted",
        data: JSON.stringify(ev.entries),
      });
      return;
    case "agent_event": {
      // user role message_start/end happens server-side already as a persisted
      // entry — the agent re-echoes it here, so we drop the duplicate signal.
      const event = ev.event;
      if (
        (event.type === "message_start" || event.type === "message_end") &&
        event.message.role === "user"
      ) {
        return;
      }
      await stream.writeSSE({ event: "agent_event", data: JSON.stringify(event) });
      return;
    }
    case "error":
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: ev.message }),
      });
      return;
    case "done":
      await stream.writeSSE({ event: "done", data: "" });
      return;
  }
}
