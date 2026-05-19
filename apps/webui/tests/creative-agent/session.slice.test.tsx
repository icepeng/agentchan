import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  SessionProvider,
  useAgentEventSubscription,
  useAgentStream,
  useAgentRunStatuses,
  useSessionInputDispatch,
  useAgentRunSettleCount,
} from "@/client/creative-agent/index.js";
import * as sessionSurface from "@/client/creative-agent/index.js";

const sessionProviderProps = {
  slug: null,
  sessionId: null,
  viewMode: null,
  onOpenSession: () => {},
  onRequestProjectActivation: () => {},
  onRequestProjectReadme: () => {},
  onToggleViewMode: () => {},
};

function ContextProbe() {
  useAgentStream(null);
  useAgentRunStatuses();
  return <span>ok</span>;
}

function AgentStreamProbe() {
  const state = useAgentStream(null);
  return <span>{state.isStreaming ? "active" : "idle"}</span>;
}

function SubscriptionProbe() {
  useAgentEventSubscription(null, () => {
    throw new Error("inactive subscription should not receive events");
  });
  return <span>subscribed</span>;
}

function StreamSurfaceProbe() {
  const statuses = useAgentRunStatuses();
  const settleCount = useAgentRunSettleCount(null);
  return <span>{`${statuses.size}:${settleCount}`}</span>;
}

function SessionInputProbe() {
  const dispatch = useSessionInputDispatch();
  return <span>{typeof dispatch}</span>;
}

describe("creative-agent slice public surface", () => {
  test("exports only the public session runtime and shell-composed UI APIs", () => {
    expect(Object.keys(sessionSurface).sort()).toEqual([
      "AgentPanel",
      "AgentPanelErrorFallback",
      "BottomInput",
      "SessionProvider",
      "cancelAgentRun",
      "useAgentEventSubscription",
      "useAgentPanel",
      "useAgentRunSettleCount",
      "useAgentRunStatuses",
      "useAgentStream",
      "useSession",
      "useSessionInputDispatch",
    ]);
  });

  test("useAgentStream returns idle state when no project is active", () => {
    expect(
      renderToString(
        <SessionProvider {...sessionProviderProps}>
          <AgentStreamProbe />
        </SessionProvider>,
      ),
    ).toContain("idle");
  });

  test("useAgentEventSubscription can be mounted with no active project", () => {
    expect(
      renderToString(
        <SessionProvider {...sessionProviderProps}>
          <SubscriptionProbe />
        </SessionProvider>,
      ),
    ).toContain("subscribed");
  });

  test("agent run status and settle hooks mount from public surface", () => {
    expect(
      renderToString(
        <SessionProvider {...sessionProviderProps}>
          <StreamSurfaceProbe />
        </SessionProvider>,
      ),
    ).toContain("0:0");
  });

  test("SessionProvider provides public session contexts", () => {
    expect(
      renderToString(
        <SessionProvider {...sessionProviderProps}>
          <ContextProbe />
        </SessionProvider>,
      ),
    ).toContain("ok");
  });

  test("SessionProvider exposes only a dispatch hook for session input intents", () => {
    expect(
      renderToString(
        <SessionProvider {...sessionProviderProps}>
          <SessionInputProbe />
        </SessionProvider>,
      ),
    ).toContain("function");
    expect(sessionSurface).not.toHaveProperty("useSessionInputState");
  });
});
