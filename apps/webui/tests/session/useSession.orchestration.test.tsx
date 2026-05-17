import { beforeEach, describe, expect, mock, test } from "bun:test";
import "../setup/happydom.js";
import "../setup/testing-library.js";
import type { ReactNode } from "react";
import type {
  AgentchanSessionInfo,
  SessionMode,
} from "@agentchan/creative-agent/browser";

const sequence: string[] = [];
let viewState = projectView(null);
let nextSessions: AgentchanSessionInfo[] = [];
let sessionDataLeafId: string | null = null;
let compactSessionPromise: Promise<void> | null = null;
let compactSessionError: Error | null = null;

function projectView(session: string | null) {
  return {
    view: { kind: "project" as const, slug: "alpha", session, mode: "chat" as const },
    sessionMemory: new Map<string, string>(),
  };
}

function sessionInfo(id: string, mode: SessionMode = "creative"): AgentchanSessionInfo {
  return {
    id,
    mode,
    createdAt: 1,
    modifiedAt: 1,
    summary: null,
    messageCount: 0,
  };
}

mock.module("swr", () => ({
  default: () => ({
    data: {
      info: sessionInfo(viewState.view.session ?? "session-1"),
      entries: [],
      leafId: sessionDataLeafId,
    },
  }),
  mutate: () => Promise.resolve(),
  SWRConfig: ({ children }: { children: ReactNode }) => children,
  useSWRConfig: () => ({
    mutate: (key: unknown, data?: unknown) => {
      const name = Array.isArray(key) ? String(key[0]) : String(key);
      sequence.push(`swr:${name}`);
      if (name === "sessions") return Promise.resolve(nextSessions);
      return Promise.resolve(data);
    },
  }),
}));

mock.module("@/client/session/data/session.api.js", () => ({
  createSession: (_projectSlug: string, mode?: SessionMode) => {
    sequence.push("api:create");
    return Promise.resolve(sessionInfo(mode === "meta" ? "meta-new" : "creative-new", mode));
  },
  deleteSession: () => {
    sequence.push("api:delete");
    return Promise.resolve();
  },
  renameSession: () => Promise.resolve({ entry: {} }),
  compactSession: async () => {
    sequence.push("api:compact");
    await compactSessionPromise;
    if (compactSessionError) throw compactSessionError;
    return {
      info: sessionInfo("session-1"),
      compactionEntry: {},
      newLeafId: "leaf-2",
    };
  },
  fetchSession: () => Promise.resolve({ info: sessionInfo("session-1"), entries: [], leafId: null }),
  fetchSessions: () => Promise.resolve([]),
  sendMessage: () => Promise.resolve(),
  regenerateResponse: () => Promise.resolve(),
  registerAbortController: () => {},
  clearAbortController: () => {},
  abortRegisteredProjectStream: () => {},
}));

mock.module("@/client/entities/view/index.js", () => ({
  useViewState: () => viewState,
  useViewDispatch: () => (action: { type: string; sessionId?: string | null }) => {
    sequence.push(`view:${action.type}`);
    if (action.type === "OPEN_SESSION") {
      viewState = projectView(action.sessionId ?? null);
    }
  },
  selectActiveProjectSlug: (state: typeof viewState) =>
    state.view.kind === "project" ? state.view.slug : null,
  selectActiveSessionId: (state: typeof viewState) =>
    state.view.kind === "project" ? state.view.session : null,
}));

const { act, renderHook } = await import("@testing-library/react");
const { SessionProvider, useAgentStream, useSession } = await import(
  "@/client/session/index.js"
);

function SessionWrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

beforeEach(() => {
  sequence.length = 0;
  viewState = projectView(null);
  nextSessions = [];
  sessionDataLeafId = null;
  compactSessionPromise = null;
  compactSessionError = null;
});

describe("useSession orchestration", () => {
  test("create mutates session caches before opening the new session", async () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionWrapper });

    await act(async () => {
      await result.current.create();
    });

    expect(sequence).toEqual([
      "api:create",
      "swr:sessions",
      "swr:session",
      "view:OPEN_SESSION",
    ]);
  });

  test("load opens the requested session without network mutations", () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionWrapper });

    act(() => {
      result.current.load("session-2");
    });

    expect(sequence).toEqual(["view:OPEN_SESSION"]);
    expect(viewState.view.session).toBe("session-2");
  });

  test("remove mutates caches before selecting the next creative session", async () => {
    viewState = projectView("session-1");
    nextSessions = [
      sessionInfo("meta-1", "meta"),
      sessionInfo("creative-next", "creative"),
    ];
    const { result } = renderHook(() => useSession(), { wrapper: SessionWrapper });

    await act(async () => {
      await result.current.remove("session-1");
    });

    expect(sequence).toEqual([
      "api:delete",
      "swr:sessions",
      "swr:session",
      "view:OPEN_SESSION",
    ]);
    expect(viewState.view.session).toBe("creative-next");
  });

  test("compact wraps mutation and cache refresh with stream start and stop", async () => {
    viewState = projectView("session-1");
    sessionDataLeafId = "leaf-1";
    let resolveCompact: (() => void) | null = null;
    const compacted = new Promise<void>((resolve) => {
      resolveCompact = resolve;
    });
    compactSessionPromise = compacted;
    const { result } = renderHook(() => ({
      session: useSession(),
      stream: useAgentStream("alpha"),
    }), { wrapper: SessionWrapper });

    let compactPromise!: Promise<void>;
    await act(async () => {
      compactPromise = result.current.session.compact();
    });

    expect(result.current.stream.isStreaming).toBe(true);
    expect(sequence).toEqual(["api:compact"]);

    resolveCompact?.();
    await act(async () => {
      await compactPromise;
    });

    expect(sequence).toEqual([
      "api:compact",
      "swr:sessions",
      "swr:session",
    ]);
    expect(result.current.stream.isStreaming).toBe(false);
  });

  test("compact records stream errors when the mutation fails", async () => {
    viewState = projectView("session-1");
    compactSessionError = new Error("compact failed");
    const { result } = renderHook(() => ({
      session: useSession(),
      stream: useAgentStream("alpha"),
    }), { wrapper: SessionWrapper });

    await act(async () => {
      await result.current.session.compact();
    });

    expect(sequence).toEqual(["api:compact"]);
    expect(result.current.stream.isStreaming).toBe(false);
    expect(result.current.stream.errorMessage).toBe("compact failed");
  });
});
