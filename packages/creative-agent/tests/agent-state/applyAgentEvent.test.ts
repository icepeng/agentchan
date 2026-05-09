import { describe, expect, test } from "bun:test";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@mariozechner/pi-ai";

import {
  EMPTY_AGENT_STATE,
  applyAgentEvent,
  type AgentState,
} from "../../src/agent-state.js";

function usage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistant(text: string, errorMessage?: string): AssistantMessage {
  const msg: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-x",
    usage: usage(),
    stopReason: "stop",
    timestamp: 1,
  };
  if (errorMessage) (msg as { errorMessage?: string }).errorMessage = errorMessage;
  return msg;
}

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: 1 };
}

function toolResult(toolCallId: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "noop",
    content: [{ type: "text", text: "ok" }],
    isError: false,
    timestamp: 2,
  };
}

describe("applyAgentEvent", () => {
  test("agent_start sets isStreaming, clears streamingMessage and errorMessage", () => {
    const seed: AgentState = {
      ...EMPTY_AGENT_STATE,
      streamingMessage: assistant("partial"),
      errorMessage: "prev",
    };
    const next = applyAgentEvent(seed, { type: "agent_start" } as AgentEvent);
    expect(next.isStreaming).toBe(true);
    expect(next.streamingMessage).toBeUndefined();
    expect(next.errorMessage).toBeUndefined();
  });

  test("agent_end clears isStreaming and streamingMessage", () => {
    const seed: AgentState = {
      ...EMPTY_AGENT_STATE,
      isStreaming: true,
      streamingMessage: assistant("partial"),
    };
    const next = applyAgentEvent(seed, { type: "agent_end" } as AgentEvent);
    expect(next.isStreaming).toBe(false);
    expect(next.streamingMessage).toBeUndefined();
  });

  test("message_start with assistant message sets streamingMessage", () => {
    const m = assistant("hi");
    const next = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "message_start",
      message: m,
    } as AgentEvent);
    expect(next.streamingMessage).toBe(m);
  });

  test("message_update with assistant message replaces streamingMessage", () => {
    const m1 = assistant("partial");
    const m2 = assistant("partial more");
    const seed = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "message_start",
      message: m1,
    } as AgentEvent);
    const next = applyAgentEvent(seed, {
      type: "message_update",
      message: m2,
    } as AgentEvent);
    expect(next.streamingMessage).toBe(m2);
  });

  test("message_start with non-assistant role is a no-op", () => {
    const seed: AgentState = {
      ...EMPTY_AGENT_STATE,
      streamingMessage: assistant("keep"),
    };
    const next = applyAgentEvent(seed, {
      type: "message_start",
      message: user("u"),
    } as AgentEvent);
    expect(next).toBe(seed);
  });

  test("message_end appends to messages and clears streamingMessage", () => {
    const u = user("hello");
    const a = assistant("hi");
    const seed: AgentState = {
      ...EMPTY_AGENT_STATE,
      messages: [u] satisfies AgentMessage[],
      streamingMessage: a,
    };
    const next = applyAgentEvent(seed, {
      type: "message_end",
      message: a,
    } as AgentEvent);
    expect(next.streamingMessage).toBeUndefined();
    expect(next.messages).toEqual([u, a]);
  });

  test("tool_execution_start adds toolCallId to pendingToolCalls", () => {
    const next = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "tool_execution_start",
      toolCallId: "tc1",
    } as AgentEvent);
    expect(next.pendingToolCalls.has("tc1")).toBe(true);
  });

  test("tool_execution_end removes toolCallId from pendingToolCalls", () => {
    const seed = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "tool_execution_start",
      toolCallId: "tc1",
    } as AgentEvent);
    const next = applyAgentEvent(seed, {
      type: "tool_execution_end",
      toolCallId: "tc1",
    } as AgentEvent);
    expect(next.pendingToolCalls.has("tc1")).toBe(false);
  });

  test("tool_execution_start preserves siblings already in pending set", () => {
    const seed = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "tool_execution_start",
      toolCallId: "tc1",
    } as AgentEvent);
    const next = applyAgentEvent(seed, {
      type: "tool_execution_start",
      toolCallId: "tc2",
    } as AgentEvent);
    expect(next.pendingToolCalls.has("tc1")).toBe(true);
    expect(next.pendingToolCalls.has("tc2")).toBe(true);
    // Set is a fresh Set, never the seed reference (immutability).
    expect(next.pendingToolCalls).not.toBe(seed.pendingToolCalls);
  });

  test("turn_end with assistant errorMessage records errorMessage", () => {
    const a = assistant("oops", "boom");
    const next = applyAgentEvent(EMPTY_AGENT_STATE, {
      type: "turn_end",
      message: a,
    } as AgentEvent);
    expect(next.errorMessage).toBe("boom");
  });

  test("turn_end without errorMessage is a no-op", () => {
    const seed: AgentState = {
      ...EMPTY_AGENT_STATE,
      messages: [user("u")],
    };
    const next = applyAgentEvent(seed, {
      type: "turn_end",
      message: assistant("clean"),
    } as AgentEvent);
    expect(next).toBe(seed);
  });

  test("returns the same state object for unhandled event variants", () => {
    const seed: AgentState = { ...EMPTY_AGENT_STATE, isStreaming: true };
    const next = applyAgentEvent(seed, {
      type: "tool_execution_update",
      toolCallId: "tc1",
    } as unknown as AgentEvent);
    expect(next).toBe(seed);
  });

  test("EMPTY_AGENT_STATE is a usable seed (idle, no messages, empty pending)", () => {
    expect(EMPTY_AGENT_STATE.isStreaming).toBe(false);
    expect(EMPTY_AGENT_STATE.messages).toEqual([]);
    expect(EMPTY_AGENT_STATE.pendingToolCalls.size).toBe(0);
  });

  test("AgentState messages can hold a tool result alongside assistant", () => {
    const a = assistant("call");
    const tr = toolResult("tc1");
    const state: AgentState = {
      ...EMPTY_AGENT_STATE,
      messages: [a, tr] satisfies AgentMessage[],
    };
    expect(state.messages).toEqual([a, tr]);
  });
});
