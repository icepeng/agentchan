import { afterEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { Dispatch, ReactNode } from "react";

const window = new Window();
globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.document = window.document as unknown as Document;
globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
globalThis.navigator = window.navigator as unknown as Navigator;
globalThis.fetch = async (input: RequestInfo | URL) => {
  fetchCalls.push(String(input));
  return new Response(JSON.stringify({ content: "server content" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

let mutateCalls: unknown[] = [];
let fetchCalls: string[] = [];

mock.module("swr", () => ({
  default: () => ({ data: undefined }),
  mutate: (key: unknown) => {
    mutateCalls.push(key);
    return Promise.resolve();
  },
  SWRConfig: ({ children }: { children: ReactNode }) => children,
  useSWRConfig: () => ({
    mutate: (key: unknown) => {
      mutateCalls.push(key);
      return Promise.resolve();
    },
  }),
}));

const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { qk } = await import("@/client/platform/index.js");
const { ViewProvider } = await import("@/client/shell/view/ViewContext.js");
const { useView } = await import("@/client/shell/index.js");
const { ProjectEditorProvider } = await import("@/client/project-editor/index.js");
const { useEditorDispatch } = await import(
  "@/client/project-editor/EditorContext.js"
);
const { SessionProvider } = await import("@/client/session/index.js");
const { useAgentStreamDispatch } = await import(
  "@/client/session/stream/AgentStreamStoreContext.js"
);
const { useInvalidateOnAgentSettle } = await import(
  "@/client/project-editor/useInvalidateOnAgentSettle.js"
);
import type { AgentStreamAction } from "@/client/session/stream/agentStreamStore.js";
import type { EditorAction } from "@/client/project-editor/editor.types.js";
import type { ViewAction } from "@/client/shell/index.js";

interface Controls {
  streamDispatch: Dispatch<AgentStreamAction> | null;
  editorDispatch: Dispatch<EditorAction> | null;
  viewDispatch: Dispatch<ViewAction> | null;
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ViewProvider>
      <SessionWithView>
        <ProjectEditorProvider>{children}</ProjectEditorProvider>
      </SessionWithView>
    </ViewProvider>
  );
}

function SessionWithView({ children }: { children: ReactNode }) {
  const view = useView();
  return (
    <SessionProvider
      slug={view.activeProjectSlug}
      sessionId={view.activeSessionId}
      viewMode={view.view.kind === "project" ? view.view.mode : null}
      onOpenSession={(sessionId) => view.dispatch({ type: "OPEN_SESSION", sessionId })}
      onRequestProjectActivation={(slug) => view.dispatch({ type: "OPEN_PROJECT", slug })}
      onRequestProjectReadme={() => view.dispatch({ type: "OPEN_PROJECT_README" })}
      onToggleViewMode={() => {
        if (view.view.kind !== "project") return;
        view.dispatch({
          type: "SET_VIEW_MODE",
          mode: view.view.mode === "edit" ? "chat" : "edit",
        });
      }}
    >
      {children}
    </SessionProvider>
  );
}

function HookProbe({ controls }: { controls: Controls }) {
  controls.streamDispatch = useAgentStreamDispatch();
  controls.editorDispatch = useEditorDispatch();
  controls.viewDispatch = useView().dispatch;
  useInvalidateOnAgentSettle();
  return null;
}

async function renderHookProbe(): Promise<Controls> {
  const controls: Controls = {
    streamDispatch: null,
    editorDispatch: null,
    viewDispatch: null,
  };
  render(
    <Providers>
      <HookProbe controls={controls} />
    </Providers>,
  );
  await act(async () => {});
  return controls;
}

afterEach(() => {
  cleanup();
  mutateCalls = [];
  fetchCalls = [];
});

describe("useInvalidateOnAgentSettle", () => {
  test("invalidates the active project tree when the stream settles", async () => {
    const controls = await renderHookProbe();

    await act(async () => {
      controls.viewDispatch?.({ type: "OPEN_PROJECT", slug: "alpha", session: null });
      controls.viewDispatch?.({ type: "SET_VIEW_MODE", mode: "edit" });
      controls.editorDispatch?.({
        type: "SELECT_FILE",
        path: "src/main.ts",
        content: "local content",
      });
    });
    await act(async () => {});

    await act(async () => {
      controls.streamDispatch?.({ type: "START", projectSlug: "alpha" });
      controls.streamDispatch?.({ type: "STOP", projectSlug: "alpha" });
    });

    await waitFor(() => {
      expect(mutateCalls).toContainEqual(qk.projectTree("alpha"));
    });
    await waitFor(() => {
      expect(fetchCalls).toContain("/api/projects/alpha/file?path=src%2Fmain.ts");
    });
  });

  test("does not reread the active file when the editor is dirty", async () => {
    const controls = await renderHookProbe();

    await act(async () => {
      controls.viewDispatch?.({ type: "OPEN_PROJECT", slug: "alpha", session: null });
      controls.viewDispatch?.({ type: "SET_VIEW_MODE", mode: "edit" });
      controls.editorDispatch?.({
        type: "SELECT_FILE",
        path: "src/main.ts",
        content: "local content",
      });
      controls.editorDispatch?.({ type: "MARK_DIRTY" });
    });
    await act(async () => {});

    await act(async () => {
      controls.streamDispatch?.({ type: "START", projectSlug: "alpha" });
      controls.streamDispatch?.({ type: "STOP", projectSlug: "alpha" });
    });

    await waitFor(() => {
      expect(mutateCalls).toContainEqual(qk.projectTree("alpha"));
    });
    expect(fetchCalls).toEqual([]);
  });

  test("does not invalidate outside edit view mode", async () => {
    const controls = await renderHookProbe();

    await act(async () => {
      controls.viewDispatch?.({ type: "OPEN_PROJECT", slug: "alpha", session: null });
      controls.editorDispatch?.({
        type: "SELECT_FILE",
        path: "src/main.ts",
        content: "local content",
      });
    });

    await act(async () => {
      controls.streamDispatch?.({ type: "START", projectSlug: "alpha" });
      controls.streamDispatch?.({ type: "STOP", projectSlug: "alpha" });
    });
    await act(async () => {});

    expect(mutateCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  test("does not let a previous slug settle invalidate the new active slug", async () => {
    const controls = await renderHookProbe();

    await act(async () => {
      controls.viewDispatch?.({ type: "OPEN_PROJECT", slug: "alpha", session: null });
      controls.viewDispatch?.({ type: "SET_VIEW_MODE", mode: "edit" });
    });
    await act(async () => {});

    await act(async () => {
      controls.viewDispatch?.({ type: "OPEN_PROJECT", slug: "beta", session: null });
      controls.viewDispatch?.({ type: "SET_VIEW_MODE", mode: "edit" });
    });
    await act(async () => {});

    await act(async () => {
      controls.streamDispatch?.({ type: "START", projectSlug: "alpha" });
      controls.streamDispatch?.({ type: "STOP", projectSlug: "alpha" });
    });
    await act(async () => {});

    expect(mutateCalls).toEqual([]);
  });
});
