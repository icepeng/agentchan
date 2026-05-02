import { describe, test, expect } from "bun:test";
import {
  viewReducer,
  initialViewState,
  type ViewState,
} from "@/client/entities/view/viewReducer.js";

describe("viewReducer", () => {
  test("OPEN_PROJECT with no remembered session yields null session and chat mode", () => {
    const next = viewReducer(initialViewState(), {
      type: "OPEN_PROJECT",
      slug: "alpha",
    });
    expect(next.view).toEqual({
      kind: "project",
      slug: "alpha",
      session: null,
      mode: "chat",
    });
  });

  test("returning to a project restores its remembered session", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s1" });
    state = viewReducer(state, { type: "OPEN_TEMPLATES" });
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    expect(state.view).toEqual({
      kind: "project",
      slug: "alpha",
      session: "s1",
      mode: "chat",
    });
  });

  test("view mode is not remembered across project re-entry", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "SET_VIEW_MODE", mode: "edit" });
    state = viewReducer(state, { type: "OPEN_TEMPLATES" });
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    expect((state.view as { mode: string }).mode).toBe("chat");
  });

  test("SET_VIEW_MODE on templates view is a no-op", () => {
    const state: ViewState = {
      view: { kind: "templates" },
      sessionMemory: new Map(),
    };
    const next = viewReducer(state, { type: "SET_VIEW_MODE", mode: "edit" });
    expect(next).toBe(state);
  });

  test("explicit session overrides remembered session", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "remembered" });
    state = viewReducer(state, { type: "OPEN_TEMPLATES" });
    state = viewReducer(state, {
      type: "OPEN_PROJECT",
      slug: "alpha",
      session: "explicit",
    });
    expect((state.view as { session: string | null }).session).toBe("explicit");
  });

  test("OPEN_SESSION(null) clears active session but preserves the memory", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s1" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: null });
    expect((state.view as { session: string | null }).session).toBeNull();
    expect(state.sessionMemory.get("alpha")).toBe("s1");
  });

  test("OPEN_SETTINGS preserves sessionMemory and accepts a tab", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s1" });
    state = viewReducer(state, { type: "OPEN_SETTINGS", tab: "api-keys" });
    expect(state.view).toEqual({ kind: "settings", tab: "api-keys" });
    expect(state.sessionMemory.get("alpha")).toBe("s1");
  });

  test("OPEN_SETTINGS without tab defaults to appearance", () => {
    const state = viewReducer(initialViewState(), { type: "OPEN_SETTINGS" });
    expect(state.view).toEqual({ kind: "settings", tab: "appearance" });
  });

  test("OPEN_SESSION updates sessionMemory for the active project", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s2" });
    expect(state.sessionMemory.get("alpha")).toBe("s2");
    expect((state.view as { session: string | null }).session).toBe("s2");
  });

  test("OPEN_SESSION outside project view is a no-op", () => {
    const start: ViewState = {
      view: { kind: "templates" },
      sessionMemory: new Map(),
    };
    const next = viewReducer(start, {
      type: "OPEN_SESSION",
      sessionId: "s1",
    });
    expect(next).toBe(start);
  });

  test("FORGET_PROJECT removes sessionMemory entry and falls back when active", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s1" });
    state = viewReducer(state, { type: "FORGET_PROJECT", slug: "alpha" });
    expect(state.sessionMemory.has("alpha")).toBe(false);
    // The view falls back to templates when the deleted project was active
    // and no fallback target was supplied.
    expect(state.view).toEqual({ kind: "templates" });
  });

  test("FORGET_PROJECT preserves view when a different project is active", () => {
    let state = initialViewState();
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "alpha" });
    state = viewReducer(state, { type: "OPEN_SESSION", sessionId: "s1" });
    state = viewReducer(state, { type: "OPEN_PROJECT", slug: "beta" });
    state = viewReducer(state, { type: "FORGET_PROJECT", slug: "alpha" });
    expect(state.sessionMemory.has("alpha")).toBe(false);
    expect(state.view).toEqual({
      kind: "project",
      slug: "beta",
      session: null,
      mode: "chat",
    });
  });
});
