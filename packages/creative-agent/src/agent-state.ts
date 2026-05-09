import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";

/**
 * UI/render-facing subset of pi `AgentState`. Lives in the browser-safe
 * surface so host and iframe-side adapter share one canonical reducer.
 *
 * `messages` blends persisted branch entries (rebuilt to AgentMessage[])
 * with in-flight `ToolResultMessage` rows. Renderers find tool results by
 * `role === "toolResult" && toolCallId === id`.
 *
 * The union is pi-agent-core's full `AgentMessage` so streaming events
 * like `custom`/`bashExecution` flow through without type narrowing on
 * the way in. Components must guard on `role` before treating an entry
 * as user/assistant.
 */
export interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

const EMPTY_PENDING: ReadonlySet<string> = new Set();
const EMPTY_MESSAGES: ReadonlyArray<AgentMessage> = [];

export const EMPTY_AGENT_STATE: AgentState = {
  messages: EMPTY_MESSAGES,
  isStreaming: false,
  pendingToolCalls: EMPTY_PENDING,
};

/**
 * Pure reducer: (state, AgentEvent) → state. 1:1 port of pi-agent-core's
 * `Agent.processEvents`. Idempotent for replay; tool-call set membership
 * is invariant across paired `tool_execution_start`/`tool_execution_end`.
 */
export function applyAgentEvent(state: AgentState, ev: AgentEvent): AgentState {
  switch (ev.type) {
    case "agent_start":
      return { ...state, isStreaming: true, streamingMessage: undefined, errorMessage: undefined };
    case "agent_end":
      return { ...state, isStreaming: false, streamingMessage: undefined };
    case "message_start":
    case "message_update":
      if (ev.message.role !== "assistant") return state;
      return { ...state, streamingMessage: ev.message };
    case "message_end":
      return {
        ...state,
        streamingMessage: undefined,
        messages: [...state.messages, ev.message],
      };
    case "tool_execution_start": {
      const pending = new Set(state.pendingToolCalls);
      pending.add(ev.toolCallId);
      return { ...state, pendingToolCalls: pending };
    }
    case "tool_execution_end": {
      const pending = new Set(state.pendingToolCalls);
      pending.delete(ev.toolCallId);
      return { ...state, pendingToolCalls: pending };
    }
    case "turn_end":
      return ev.message.role === "assistant" && ev.message.errorMessage
        ? { ...state, errorMessage: ev.message.errorMessage }
        : state;
    default:
      return state; // tool_execution_update, turn_start
  }
}
