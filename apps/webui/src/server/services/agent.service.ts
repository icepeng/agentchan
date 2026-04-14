import type { SSEStreamingApi } from "hono/streaming";
import {
  type AgentEvent,
  type AgentContext,
  type SessionEvent,
  type ToolCall,
  runPrompt,
  runRegenerate,
} from "@agentchan/creative-agent";

/**
 * SSE adapter — translates SessionEvent into the wire format the frontend
 * already expects. Event name strings here are the client contract; see
 * useChatStream for the consumer.
 */
export function createAgentService(ctx: AgentContext) {
  return {
    async sendMessage(
      stream: SSEStreamingApi,
      slug: string,
      conversationId: string,
      parentNodeId: string | null,
      text: string,
      signal?: AbortSignal,
    ) {
      const queue = createSerialWriter(stream);
      try {
        await runPrompt(
          ctx,
          { slug, conversationId, parentNodeId, text },
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
      conversationId: string,
      userNodeId: string,
      signal?: AbortSignal,
    ) {
      const queue = createSerialWriter(stream);
      try {
        await runRegenerate(
          ctx,
          { slug, conversationId, userNodeId },
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
 * SSE writes are async. We need a serial queue so back-to-back text deltas
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
    case "user_node":
      await stream.writeSSE({ event: "user_node", data: JSON.stringify(ev.node) });
      return;
    case "agent_event": {
      const sse = agentEventToSSE(ev.event);
      if (sse) await stream.writeSSE(sse);
      return;
    }
    case "assistant_nodes":
      await stream.writeSSE({
        event: "assistant_nodes",
        data: JSON.stringify(ev.nodes),
      });
      return;
    case "usage_summary":
      await stream.writeSSE({
        event: "usage_summary",
        data: JSON.stringify(ev.usage),
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

function agentEventToSSE(event: AgentEvent): { event: string; data: string } | null {
  switch (event.type) {
    case "message_update": {
      const sub = event.assistantMessageEvent;
      switch (sub.type) {
        case "text_delta":
          return { event: "text_delta", data: JSON.stringify({ text: sub.delta }) };
        case "thinking_delta":
          return { event: "thinking_delta", data: JSON.stringify({ text: sub.delta }) };
        case "toolcall_start": {
          const tc = sub.partial.content[sub.contentIndex] as ToolCall;
          return {
            event: "tool_use_start",
            data: JSON.stringify({ id: tc?.id ?? "", name: tc?.name ?? "" }),
          };
        }
        case "toolcall_delta": {
          const tc = sub.partial.content[sub.contentIndex] as ToolCall;
          return {
            event: "tool_use_delta",
            data: JSON.stringify({ id: tc?.id ?? "", input_json: sub.delta }),
          };
        }
        case "toolcall_end":
          return { event: "tool_use_end", data: JSON.stringify({ id: sub.toolCall.id }) };
        default:
          return null;
      }
    }
    case "tool_execution_start":
      return {
        event: "tool_exec_start",
        data: JSON.stringify({
          id: event.toolCallId,
          name: event.toolName,
          parallel: false,
        }),
      };
    case "tool_execution_end":
      return {
        event: "tool_exec_end",
        data: JSON.stringify({ id: event.toolCallId, is_error: event.isError }),
      };
    default:
      return null;
  }
}
