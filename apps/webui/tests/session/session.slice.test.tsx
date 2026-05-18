import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  SessionProvider,
  useAgentEventSubscription,
  useAgentStream,
  useProjectStreamStatuses,
  useSessionInputDispatch,
  useStreamSettleCount,
} from "@/client/session/index.js";
import * as sessionSurface from "@/client/session/index.js";

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
  useProjectStreamStatuses();
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
  const statuses = useProjectStreamStatuses();
  const settleCount = useStreamSettleCount(null);
  return <span>{`${statuses.size}:${settleCount}`}</span>;
}

function SessionInputProbe() {
  const dispatch = useSessionInputDispatch();
  return <span>{typeof dispatch}</span>;
}

describe("session slice public surface", () => {
  test("exports only the public session runtime APIs", () => {
    expect(Object.keys(sessionSurface).sort()).toEqual([
      "SessionProvider",
      "closeProjectStream",
      "useAgentEventSubscription",
      "useAgentPanel",
      "useAgentStream",
      "useProjectStreamStatuses",
      "useSession",
      "useSessionInputDispatch",
      "useStreamSettleCount",
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

  test("project stream status and settle hooks mount from public surface", () => {
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
