import type { SSEStreamingApi } from "hono/streaming";
import {
  type AgentContext,
  type SessionEvent,
  runPrompt,
  runRegenerate,
} from "@agentchan/creative-agent";

/**
 * SSE adapter — forwards pi `AgentEvent` and persisted Pi session entries.
 *
 * `prepareRun` is called before each prompt/regenerate. OAuth providers use it
 * to refresh expired tokens into the DB so the sync `resolveAgentConfig` reads
 * fresh credentials.
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
      parentEntryId: string | null,
      text: string,
      signal?: AbortSignal,
    ) {
      await prepareRun();
      const queue = createSerialWriter(stream);
      try {
        await runPrompt(
          ctx,
          { slug, sessionId, parentEntryId, text },
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
      userEntryId: string,
      signal?: AbortSignal,
    ) {
      await prepareRun();
      const queue = createSerialWriter(stream);
      try {
        await runRegenerate(
          ctx,
          { slug, sessionId, userEntryId },
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
    case "entry":
      await stream.writeSSE({ event: "entry", data: JSON.stringify(ev.entry) });
      return;
    case "agent_event": {
      // User messages are persisted and sent through the `entry` channel.
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
    case "snapshot":
      await stream.writeSSE({
        event: "snapshot",
        data: JSON.stringify(ev.snapshot),
      });
      return;
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
