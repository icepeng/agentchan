import { describe, test, expect } from "bun:test";
import {
  createPresentationMachine,
  iframeWrapperClassName,
  type PresentationCommand,
  type PresentationEvent,
  type PresentationMachine,
  type PresentationState,
} from "../../src/client/features/project/renderer-host/presentationMachine.js";
import type {
  RendererSnapshot,
  RendererTheme,
} from "../../src/client/entities/renderer/index.js";

// --- Fixtures ---------------------------------------------------------------

function makeSnapshot(slug: string): RendererSnapshot {
  return {
    slug,
    baseUrl: `https://host.example/api/projects/${slug}`,
    files: [],
    state: {
      messages: [],
      isStreaming: false,
      pendingToolCalls: [],
    },
  };
}

function makeTheme(accent: string): RendererTheme {
  return { base: { accent } };
}

function step(
  machine: PresentationMachine,
  state: PresentationState,
  events: PresentationEvent[],
): { state: PresentationState; commands: PresentationCommand[] } {
  let cur = state;
  const commands: PresentationCommand[] = [];
  for (const event of events) {
    const result = machine.transition(cur, event);
    cur = result.state;
    commands.push(...result.commands);
  }
  return { state: cur, commands };
}

function commandTypes(commands: PresentationCommand[]): string[] {
  return commands.map((c) => c.type);
}

// --- Tests ------------------------------------------------------------------

describe("createPresentationMachine — initial state", () => {
  test("starts idle with null slug + digest", () => {
    const m = createPresentationMachine();
    const s = m.initialState();
    expect(s.phase).toBe("idle");
    expect(s.generation).toBe(0);
    expect(s.requestedSlug).toBeNull();
    expect(s.visibleSlug).toBeNull();
    expect(s.digest).toBeNull();
    expect(s.snapshot).toBeNull();
    expect(s.themeIdentity).toBe("null");
    expect(s.visibleError).toBeNull();
  });
});

describe("REQUEST_SLUG", () => {
  test("first request transitions to loading + bumps generation", () => {
    const m = createPresentationMachine();
    const { state } = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]);
    expect(state.phase).toBe("loading");
    expect(state.requestedSlug).toBe("alpha");
    expect(state.generation).toBe(1);
    expect(state.visibleSlug).toBeNull();
  });

  test("identical slug is identity-equal noop (StrictMode dedup)", () => {
    const m = createPresentationMachine();
    const start = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]);
    const result = m.transition(start.state, {
      type: "REQUEST_SLUG",
      slug: "alpha",
    });
    expect(result.state).toBe(start.state);
    expect(result.commands).toEqual([]);
  });

  test("REQUEST_SLUG null clears digest + emits null theme", () => {
    const m = createPresentationMachine();
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const { state, commands } = step(m, mounted.state, [
      { type: "REQUEST_SLUG", slug: null },
    ]);
    expect(state.phase).toBe("idle");
    expect(state.requestedSlug).toBeNull();
    expect(state.visibleSlug).toBeNull();
    expect(state.digest).toBeNull();
    expect(state.themeIdentity).toBe("null");
    expect(commandTypes(commands)).toEqual(["emitTheme"]);
    expect(commands[0]).toEqual({ type: "emitTheme", theme: null });
  });

  test("REQUEST_SLUG to a different slug while mounted clears theme + drops back to loading", () => {
    const m = createPresentationMachine();
    const mounted = mountFlow(m, "alpha", makeTheme("red"));
    expect(mounted.state.phase).toBe("mounted");

    const { state, commands } = step(m, mounted.state, [
      { type: "REQUEST_SLUG", slug: "beta" },
    ]);
    expect(state.phase).toBe("loading");
    expect(state.requestedSlug).toBe("beta");
    expect(state.visibleSlug).toBeNull();
    expect(state.digest).toBeNull();
    expect(state.themeIdentity).toBe("null");
    // generation increments (forces iframe key change downstream).
    expect(state.generation).toBe(mounted.state.generation + 1);
    expect(commandTypes(commands)).toEqual(["emitTheme"]);
  });
});

describe("DIGEST_READY", () => {
  test("stores digest + snapshot when slug matches requestedSlug", () => {
    const m = createPresentationMachine();
    const requested = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]).state;
    const snapshot = makeSnapshot("alpha");

    const { state, commands } = step(m, requested, [
      { type: "DIGEST_READY", slug: "alpha", digest: "x1", snapshot },
    ]);
    expect(state.digest).toBe("x1");
    expect(state.snapshot).toBe(snapshot);
    expect(state.phase).toBe("loading"); // still waiting on MOUNTED ack
    expect(commands).toEqual([]);
  });

  test("ignores DIGEST_READY for a stale slug", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;

    const result = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    });
    expect(result.state).toBe(state);
    expect(result.commands).toEqual([]);
  });
});

describe("MOUNTED ack", () => {
  test("happy path: REQUEST → DIGEST_READY → MOUNTED → mounted phase + emit theme", () => {
    const m = createPresentationMachine();
    const snapshot = makeSnapshot("alpha");
    const theme = makeTheme("red");

    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot,
    }).state;
    const generation = state.generation;
    const result = m.transition(state, {
      type: "MOUNTED",
      generation,
      theme,
    });
    state = result.state;
    expect(state.phase).toBe("mounted");
    expect(state.visibleSlug).toBe("alpha");
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
    expect(result.commands[0]).toEqual({ type: "emitTheme", theme });
  });

  test("MOUNTED with stale generation is dropped", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const stale = state.generation;
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;

    const before = state;
    const result = m.transition(state, {
      type: "MOUNTED",
      generation: stale,
      theme: null,
    });
    expect(result.state).toBe(before);
    expect(result.commands).toEqual([]);
  });

  test("MOUNT_FAILED transitions to showing-error", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const generation = state.generation;

    const result = m.transition(state, {
      type: "MOUNT_FAILED",
      generation,
      message: "boom",
    });
    expect(result.state.phase).toBe("showing-error");
    expect(result.state.visibleError).toBe("boom");
  });
});

describe("THEME_PUSHED", () => {
  test("emits theme when identity differs", () => {
    const m = createPresentationMachine();
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const next = makeTheme("blue");
    const result = m.transition(mounted.state, {
      type: "THEME_PUSHED",
      generation: mounted.state.generation,
      theme: next,
    });
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
    expect(result.state.themeIdentity).not.toBe(mounted.state.themeIdentity);
  });

  test("THEME_PUSHED with same identity is identity-equal noop", () => {
    const m = createPresentationMachine();
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const same = makeTheme("red");
    const result = m.transition(mounted.state, {
      type: "THEME_PUSHED",
      generation: mounted.state.generation,
      theme: same,
    });
    expect(result.state).toBe(mounted.state);
    expect(result.commands).toEqual([]);
  });

  test("THEME_PUSHED with stale generation is dropped", () => {
    const m = createPresentationMachine();
    const mounted = mountFlow(m, "alpha", makeTheme("red"));
    const stale = mounted.state.generation;
    const switched = m.transition(mounted.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;

    const result = m.transition(switched, {
      type: "THEME_PUSHED",
      generation: stale,
      theme: makeTheme("blue"),
    });
    expect(result.state).toBe(switched);
    expect(result.commands).toEqual([]);
  });
});

describe("ERROR_REPORTED", () => {
  test("transitions to showing-error", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;

    const result = m.transition(state, {
      type: "ERROR_REPORTED",
      message: "404",
    });
    expect(result.state.phase).toBe("showing-error");
    expect(result.state.visibleError).toBe("404");
  });
});

describe("iframeWrapperClassName mapping", () => {
  test("hides iframe in idle/loading, shows in mounted/showing-error", () => {
    expect(iframeWrapperClassName("idle")).toContain("opacity-0");
    expect(iframeWrapperClassName("loading")).toContain("opacity-0");
    expect(iframeWrapperClassName("mounted")).toContain("opacity-100");
    expect(iframeWrapperClassName("showing-error")).toContain("opacity-100");
  });
});

// --- helpers ----------------------------------------------------------------

function mountFlow(
  machine: PresentationMachine,
  slug: string,
  theme: RendererTheme | null = null,
): { state: PresentationState; snapshot: RendererSnapshot; digest: string } {
  const snapshot = makeSnapshot(slug);
  const digest = `${slug}-digest`;
  let state = machine.initialState();
  state = machine.transition(state, { type: "REQUEST_SLUG", slug }).state;
  state = machine.transition(state, {
    type: "DIGEST_READY",
    slug,
    digest,
    snapshot,
  }).state;
  state = machine.transition(state, {
    type: "MOUNTED",
    generation: state.generation,
    theme,
  }).state;
  return { state, snapshot, digest };
}
