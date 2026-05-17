import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  EMPTY_AGENT_STATE,
  publishAgentEvent,
  subscribeAgentEvents,
  SessionProvider,
  useAgentEventSubscription,
  useAgentStateMap,
  useAgentStream,
  useSessionSelectionState,
} from "@/client/session/index.js";

function ContextProbe() {
  useAgentStateMap();
  useSessionSelectionState();
  return <span>ok</span>;
}

function AgentStreamProbe() {
  const state = useAgentStream(null);
  return <span>{state === EMPTY_AGENT_STATE ? "idle" : "active"}</span>;
}

function SubscriptionProbe() {
  useAgentEventSubscription(null, () => {
    throw new Error("inactive subscription should not receive events");
  });
  return <span>subscribed</span>;
}

describe("session slice public surface", () => {
  test("useAgentStream returns idle state when no project is active", () => {
    expect(
      renderToString(
        <SessionProvider>
          <AgentStreamProbe />
        </SessionProvider>,
      ),
    ).toContain("idle");
  });

  test("re-exported agent event bus publishes events by slug", () => {
    const received: string[] = [];
    const unsubscribe = subscribeAgentEvents((slug) => {
      received.push(slug);
    });

    try {
      publishAgentEvent("project-a", { type: "agent_start" });
      publishAgentEvent("project-b", { type: "agent_end" });
    } finally {
      unsubscribe();
    }

    expect(received).toEqual(["project-a", "project-b"]);
  });

  test("useAgentEventSubscription can be mounted with no active project", () => {
    expect(
      renderToString(
        <SessionProvider>
          <SubscriptionProbe />
        </SessionProvider>,
      ),
    ).toContain("subscribed");
  });

  test("SessionProvider provides agent stream and session selection contexts", () => {
    expect(
      renderToString(
        <SessionProvider>
          <ContextProbe />
        </SessionProvider>,
      ),
    ).toContain("ok");
  });
});
