import { describe, expect, test } from "bun:test";
import {
  type AgentEvent,
  type AgentMessage,
} from "@agentchan/creative-agent/browser";
import {
  closeProjectStream,
  type AgentState,
} from "@/client/session/index.js";
import { registerAbortController } from "@/client/session/data/index.js";
import { recordAgentEvent } from "@/client/session/useRecordAgentEvent.js";
import { createAgentEventBus } from "@/client/session/stream/agentEventBus.js";
import { registerAgentStreamStore } from "@/client/session/stream/closeProjectStream.js";
import {
  createAgentStreamStore,
  toProjectStreamStatus,
} from "@/client/session/stream/agentStreamStore.js";

const IDLE_AGENT_STATE: AgentState = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: new Set(),
};

function state(overrides: Partial<AgentState>): AgentState {
  return { ...IDLE_AGENT_STATE, ...overrides };
}

describe("session stream status", () => {
  test("prioritizes error over streaming over idle", () => {
    expect(
      toProjectStreamStatus(state({ errorMessage: "boom", isStreaming: true })),
    ).toEqual({ kind: "error", message: "boom" });
    expect(toProjectStreamStatus(state({ isStreaming: true }))).toEqual({
      kind: "streaming",
    });
    expect(toProjectStreamStatus(IDLE_AGENT_STATE)).toEqual({ kind: "idle" });
  });
});

describe("agent stream store", () => {
  test("notifies only subscribers for the changed slug", () => {
    const store = createAgentStreamStore();
    let aRenders = 0;
    let bRenders = 0;

    store.subscribe(() => {
      aRenders += 1;
    }, "a");
    store.subscribe(() => {
      bRenders += 1;
    }, "b");

    store.dispatch({ type: "START", projectSlug: "a" });

    expect(aRenders).toBe(1);
    expect(bRenders).toBe(0);
  });

  test("keeps statuses cache reference for token chunk events", () => {
    const store = createAgentStreamStore();
    store.dispatch({ type: "START", projectSlug: "a" });
    const before = store.getStatuses();

    store.dispatch({
      type: "AGENT_EVENT",
      projectSlug: "a",
      event: {
        type: "message_update",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "partial" }],
          api: "anthropic-messages",
          provider: "anthropic",
          model: "claude",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp: 1,
        },
      } satisfies AgentEvent,
    });

    expect(store.getStatuses()).toBe(before);
  });

  test("invalidates statuses cache when status changes", () => {
    const store = createAgentStreamStore();
    const before = store.getStatuses();

    store.dispatch({ type: "START", projectSlug: "a" });

    expect(store.getStatuses()).not.toBe(before);
    expect(store.getStatuses().get("a")).toEqual({ kind: "streaming" });
  });

  test("increments settleSeq on falling streaming transitions only", () => {
    const store = createAgentStreamStore();

    store.dispatch({ type: "STOP", projectSlug: "a" });
    expect(store.getSettleSeq("a")).toBe(0);

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "STOP", projectSlug: "a" });
    expect(store.getSettleSeq("a")).toBe(1);

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "ERROR", projectSlug: "a", message: "boom" });
    expect(store.getSettleSeq("a")).toBe(2);

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({
      type: "AGENT_EVENT",
      projectSlug: "a",
      event: { type: "agent_end" } satisfies AgentEvent,
    });
    expect(store.getSettleSeq("a")).toBe(3);
  });

  test("settleSeq is isolated per slug and CLOSE settles only that slug", () => {
    const store = createAgentStreamStore();
    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "START", projectSlug: "b" });
    store.dispatch({ type: "STOP", projectSlug: "a" });

    expect(store.getSettleSeq("a")).toBe(1);
    expect(store.getSettleSeq("b")).toBe(0);

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "CLOSE", projectSlug: "a" });
    expect(store.getSettleSeq("a")).toBe(2);
    expect(store.getStateFor("a").isStreaming).toBe(false);
    expect(store.getStateFor("b").isStreaming).toBe(true);
  });

  test("HYDRATE preserves settleSeq while replacing idle messages", () => {
    const store = createAgentStreamStore();
    const messages: AgentMessage[] = [{ role: "user", content: "hi", timestamp: 1 }];

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "STOP", projectSlug: "a" });
    store.dispatch({ type: "HYDRATE", projectSlug: "a", messages });

    expect(store.getSettleSeq("a")).toBe(1);
    expect(store.getStateFor("a").messages).toEqual(messages);
  });

  test("getStateFor returns canonical AgentState without internal settleSeq", () => {
    const store = createAgentStreamStore();

    store.dispatch({ type: "START", projectSlug: "a" });
    store.dispatch({ type: "STOP", projectSlug: "a" });

    expect("settleSeq" in store.getStateFor("a")).toBe(false);
    expect(store.getSettleSeq("a")).toBe(1);
  });

  test("closeProjectStream aborts and dispatches CLOSE idempotently", async () => {
    const store = createAgentStreamStore();
    const unregister = registerAgentStreamStore(store);
    const controller = new AbortController();
    let aborts = 0;
    controller.signal.addEventListener("abort", () => {
      aborts += 1;
    });

    try {
      registerAbortController("a", controller);
      store.dispatch({ type: "START", projectSlug: "a" });

      await closeProjectStream("a");
      await closeProjectStream("a");

      expect(aborts).toBe(1);
      expect(store.getSettleSeq("a")).toBe(1);
      expect(store.getStateFor("a").isStreaming).toBe(false);
    } finally {
      unregister();
    }
  });

  test("recordAgentEvent updates store and publishes through the provided bus", () => {
    const store = createAgentStreamStore();
    const bus = createAgentEventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((slug) => {
      seen.push(slug);
    });

    try {
      recordAgentEvent(store.dispatch, bus, "a", { type: "agent_start" });

      expect(store.getStateFor("a").isStreaming).toBe(true);
      expect(seen).toEqual(["a"]);
    } finally {
      unsubscribe();
    }
  });
});
