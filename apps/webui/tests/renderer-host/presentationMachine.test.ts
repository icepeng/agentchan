import { describe, test, expect } from "bun:test";
import {
  createPresentationMachine,
  layerClassName,
  type PresentationCommand,
  type PresentationEvent,
  type PresentationMachine,
  type PresentationState,
} from "../../src/client/features/project/renderer-host/presentationMachine.js";
import type {
  RendererBundle,
  RendererSnapshot,
  RendererTheme,
} from "../../src/client/entities/renderer/index.js";
import type { RendererModule } from "../../src/client/features/project/renderer-host/rendererRuntime.js";

// --- Fixtures ---------------------------------------------------------------

const ZERO_CONFIG = { fadeOutMs: 0, themeWindowMs: 0, fadeInMs: 0 };

function makeBundle(id = "bundle"): RendererBundle {
  return { js: `// ${id}`, css: [] };
}

function makeSnapshot(slug: string): RendererSnapshot {
  return {
    slug,
    baseUrl: `/api/projects/${slug}`,
    files: [],
    state: {
      messages: [],
      isStreaming: false,
      pendingToolCalls: [],
    },
  };
}

function makeModule(): RendererModule {
  return {
    renderer: {
      mount: () => ({ update: () => {}, unmount: () => {} }),
    } as unknown as RendererModule["renderer"],
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
  test("starts idle with null slugs and empty mounted/prepared", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const s = m.initialState();
    expect(s.phase).toBe("idle");
    expect(s.generation).toBe(0);
    expect(s.visibleSlug).toBeNull();
    expect(s.requestedSlug).toBeNull();
    expect(s.mounted).toBeNull();
    expect(s.prepared).toBeNull();
    expect(s.themeIdentity).toBe("null");
    expect(s.visibleError).toBeNull();
    expect(s.pendingError).toBeNull();
  });
});

describe("REQUEST_SLUG", () => {
  test("first request transitions to waiting-for-import without fade-out", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const { state, commands } = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]);

    expect(state.phase).toBe("waiting-for-import");
    expect(state.requestedSlug).toBe("alpha");
    expect(state.generation).toBe(1);
    expect(commandTypes(commands)).toEqual(["cancelTimer"]);
  });

  test("identical slug is identity-equal noop with no commands (StrictMode dedup)", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
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

  test("when mounted, switching slug triggers fade-out + scheduleTimer", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha");

    const { state, commands } = step(m, mounted.state, [
      { type: "REQUEST_SLUG", slug: "beta" },
    ]);

    expect(state.phase).toBe("fading-out");
    expect(state.requestedSlug).toBe("beta");
    expect(state.generation).toBe(mounted.state.generation + 1);
    expect(state.prepared).toBeNull();
    expect(commandTypes(commands)).toEqual(["cancelTimer", "scheduleTimer"]);
    const sched = commands.find((c) => c.type === "scheduleTimer");
    expect(sched).toMatchObject({
      timer: "fade-out",
      generation: state.generation,
    });
  });

  test("REQUEST_SLUG null clears layer + emits null theme + cancels timer", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const { state, commands } = step(m, mounted.state, [
      { type: "REQUEST_SLUG", slug: null },
    ]);

    expect(state.phase).toBe("idle");
    expect(state.visibleSlug).toBeNull();
    expect(state.requestedSlug).toBeNull();
    expect(state.mounted).toBeNull();
    expect(state.themeIdentity).toBe("null");
    const types = commandTypes(commands);
    expect(types).toContain("cancelTimer");
    expect(types).toContain("clearLayer");
    expect(types).toContain("emitTheme");
    const emit = commands.find((c) => c.type === "emitTheme");
    expect(emit).toEqual({ type: "emitTheme", theme: null });
  });
});

describe("happy path", () => {
  test("cold start: REQUEST → BUNDLE_READY → IMPORT_OK → THEME_WINDOW → MOUNT → FADE_IN → stable", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const bundle = makeBundle();
    const snapshot = makeSnapshot("alpha");
    const module = makeModule();
    const theme = makeTheme("red");

    let state = m.initialState();
    let result = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" });
    state = result.state;
    expect(state.phase).toBe("waiting-for-import");

    result = m.transition(state, {
      type: "BUNDLE_READY",
      slug: "alpha",
      bundle,
      snapshot,
    });
    state = result.state;
    // BUNDLE_READY in waiting-for-import issues import command, no phase change.
    expect(state.phase).toBe("waiting-for-import");
    expect(commandTypes(result.commands)).toEqual(["import"]);
    const importCmd = result.commands[0];
    expect(importCmd?.type).toBe("import");

    const generation = state.generation;
    result = m.transition(state, {
      type: "IMPORT_OK",
      generation,
      slug: "alpha",
      bundle,
      module,
      snapshot,
      theme,
    });
    state = result.state;
    expect(state.phase).toBe("applying-theme");
    expect(commandTypes(result.commands)).toEqual([
      "emitTheme",
      "scheduleTimer",
    ]);

    result = m.transition(state, {
      type: "THEME_WINDOW_DONE",
      generation,
    });
    state = result.state;
    expect(state.phase).toBe("mounting");
    expect(commandTypes(result.commands)).toEqual(["mount"]);

    result = m.transition(state, {
      type: "MOUNT_SUCCEEDED",
      generation,
    });
    state = result.state;
    expect(state.phase).toBe("fading-in");
    expect(state.visibleSlug).toBe("alpha");
    expect(state.mounted?.bundle).toBe(bundle);
    expect(state.mounted?.module).toBe(module);
    expect(commandTypes(result.commands)).toEqual(["scheduleTimer"]);

    result = m.transition(state, { type: "FADE_IN_DONE", generation });
    state = result.state;
    expect(state.phase).toBe("stable");
  });

  test("project switch: REQUEST → FADE_OUT → IMPORT_OK delivered during fade → THEME → MOUNT → FADE_IN", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const beta = mountFlow(m, "alpha");
    let state = beta.state;

    let result = m.transition(state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    });
    state = result.state;
    const generation = state.generation;
    expect(state.phase).toBe("fading-out");

    const bundle = makeBundle("beta");
    const snapshot = makeSnapshot("beta");
    const module = makeModule();
    const theme = makeTheme("blue");

    result = m.transition(state, {
      type: "BUNDLE_READY",
      slug: "beta",
      bundle,
      snapshot,
    });
    state = result.state;
    expect(commandTypes(result.commands)).toEqual(["import"]);

    // Import resolves while still fading out — held in `prepared`, no phase change.
    result = m.transition(state, {
      type: "IMPORT_OK",
      generation,
      slug: "beta",
      bundle,
      module,
      snapshot,
      theme,
    });
    state = result.state;
    expect(state.phase).toBe("fading-out");
    expect(state.prepared?.slug).toBe("beta");
    expect(result.commands).toEqual([]);

    // FADE_OUT_DONE applies the held prepared (no need to clearLayer first
    // because mount will replace the previous content).
    result = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation,
    });
    state = result.state;
    expect(state.phase).toBe("applying-theme");
    expect(commandTypes(result.commands)).toEqual([
      "emitTheme",
      "scheduleTimer",
    ]);
  });

  test("FADE_OUT_DONE without prepared falls through to waiting-for-import + clearLayer", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha");
    let state = mounted.state;

    let result = m.transition(state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    });
    state = result.state;

    result = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: state.generation,
    });
    state = result.state;
    expect(state.phase).toBe("waiting-for-import");
    expect(commandTypes(result.commands)).toEqual(["clearLayer"]);
  });
});

describe("race conditions", () => {
  test("stale IMPORT_OK after a second REQUEST_SLUG is dropped (identity-equal state, empty commands)", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const firstGeneration = state.generation;
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;

    const before = state;
    const result = m.transition(state, {
      type: "IMPORT_OK",
      generation: firstGeneration,
      slug: "alpha",
      bundle: makeBundle(),
      module: makeModule(),
      snapshot: makeSnapshot("alpha"),
      theme: null,
    });
    expect(result.state).toBe(before);
    expect(result.commands).toEqual([]);
  });

  test("REQUEST_SLUG mid-fade-out increments generation and re-schedules fade-out", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha");
    let state = mounted.state;
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;
    const fadingGen = state.generation;
    expect(state.phase).toBe("fading-out");

    const next = m.transition(state, {
      type: "REQUEST_SLUG",
      slug: "gamma",
    });
    expect(next.state.generation).toBe(fadingGen + 1);
    expect(next.state.requestedSlug).toBe("gamma");
    expect(next.state.phase).toBe("fading-out");
    expect(commandTypes(next.commands)).toEqual([
      "cancelTimer",
      "scheduleTimer",
    ]);
  });

  test("stale timer events with mismatched generation are dropped", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const before = state;

    const stale = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: state.generation + 99,
    });
    expect(stale.state).toBe(before);
    expect(stale.commands).toEqual([]);
  });
});

describe("error handling", () => {
  test("IMPORT_FAIL transitions to terminal showing-error", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const generation = state.generation;

    const result = m.transition(state, {
      type: "IMPORT_FAIL",
      generation,
      message: "boom",
    });
    state = result.state;
    expect(state.phase).toBe("showing-error");
    expect(state.visibleError).toBe("boom");
    expect(state.visibleSlug).toBe("alpha");
    expect(commandTypes(result.commands)).toContain("clearLayer");
    expect(commandTypes(result.commands)).toContain("cancelTimer");
  });

  test("showing-error is only escapable via REQUEST_SLUG (timer/import events are dropped)", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "IMPORT_FAIL",
      generation: state.generation,
      message: "boom",
    }).state;
    expect(state.phase).toBe("showing-error");

    const errorGen = state.generation;
    // Timer firings (with current gen) should not move us out.
    const tFade = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: errorGen,
    });
    expect(tFade.state).toBe(state);
    expect(tFade.commands).toEqual([]);

    const tTheme = m.transition(state, {
      type: "THEME_WINDOW_DONE",
      generation: errorGen,
    });
    expect(tTheme.state).toBe(state);

    const tFadeIn = m.transition(state, {
      type: "FADE_IN_DONE",
      generation: errorGen,
    });
    expect(tFadeIn.state).toBe(state);

    // Import responses for this generation are also dropped.
    const tImport = m.transition(state, {
      type: "IMPORT_OK",
      generation: errorGen,
      slug: "alpha",
      bundle: makeBundle(),
      module: makeModule(),
      snapshot: makeSnapshot("alpha"),
      theme: null,
    });
    expect(tImport.state).toBe(state);

    // REQUEST_SLUG escapes.
    const escape = m.transition(state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    });
    expect(escape.state.phase).not.toBe("showing-error");
    expect(escape.state.requestedSlug).toBe("beta");
    expect(escape.state.visibleError).toBeNull();
  });

  test("ERROR_REPORTED during fade-out is deferred until FADE_OUT_DONE", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha");
    let state = mounted.state;
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;
    const generation = state.generation;

    const reported = m.transition(state, {
      type: "ERROR_REPORTED",
      message: "404",
    });
    expect(reported.state.phase).toBe("fading-out");
    expect(reported.state.pendingError).toBe("404");
    expect(reported.commands).toEqual([]);

    const finished = m.transition(reported.state, {
      type: "FADE_OUT_DONE",
      generation,
    });
    expect(finished.state.phase).toBe("showing-error");
    expect(finished.state.visibleError).toBe("404");
    expect(finished.state.pendingError).toBeNull();
  });

  test("ERROR_REPORTED outside fade-out transitions immediately", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;

    const result = m.transition(state, {
      type: "ERROR_REPORTED",
      message: "boom",
    });
    expect(result.state.phase).toBe("showing-error");
    expect(result.state.visibleError).toBe("boom");
  });
});

describe("snapshot updates while mounted", () => {
  test("snapshot update issues updateSnapshot + evaluateTheme when stable", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha");
    expect(mounted.state.phase).toBe("stable");

    const next = makeSnapshot("alpha");
    const result = m.transition(mounted.state, {
      type: "SNAPSHOT_UPDATED",
      slug: "alpha",
      snapshot: next,
    });
    expect(commandTypes(result.commands)).toEqual([
      "updateSnapshot",
      "evaluateTheme",
    ]);
    expect(result.state.mounted?.snapshot).toBe(next);
  });

  test("THEME_EVALUATED with same identity is identity-equal noop", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const same = makeTheme("red");
    const result = m.transition(mounted.state, {
      type: "THEME_EVALUATED",
      generation: mounted.state.generation,
      theme: same,
    });
    expect(result.state).toBe(mounted.state);
    expect(result.commands).toEqual([]);
  });

  test("THEME_EVALUATED with different identity issues emitTheme + updates identity", () => {
    const m = createPresentationMachine(ZERO_CONFIG);
    const mounted = mountFlow(m, "alpha", makeTheme("red"));

    const next = makeTheme("blue");
    const result = m.transition(mounted.state, {
      type: "THEME_EVALUATED",
      generation: mounted.state.generation,
      theme: next,
    });
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
    expect(result.state.themeIdentity).not.toBe(mounted.state.themeIdentity);
  });
});

describe("layerClassName mapping", () => {
  test("preserves Tailwind classes from previous implementation", () => {
    expect(layerClassName("idle")).toContain("opacity-100");
    expect(layerClassName("stable")).toContain("opacity-100");
    expect(layerClassName("fading-out")).toContain("opacity-0");
    expect(layerClassName("fading-out")).toContain("duration-300");
    expect(layerClassName("waiting-for-import")).toContain("opacity-0");
    expect(layerClassName("applying-theme")).toContain("opacity-0");
    expect(layerClassName("mounting")).toContain("opacity-0");
    expect(layerClassName("fading-in")).toContain("opacity-100");
    expect(layerClassName("fading-in")).toContain("duration-200");
    expect(layerClassName("showing-error")).toContain("opacity-100");
  });
});

// --- helpers ----------------------------------------------------------------

function mountFlow(
  machine: PresentationMachine,
  slug: string,
  theme: RendererTheme | null = null,
): { state: PresentationState; bundle: RendererBundle; snapshot: RendererSnapshot } {
  const bundle = makeBundle(slug);
  const snapshot = makeSnapshot(slug);
  const module = makeModule();

  let state = machine.initialState();
  state = machine.transition(state, { type: "REQUEST_SLUG", slug }).state;
  state = machine.transition(state, {
    type: "BUNDLE_READY",
    slug,
    bundle,
    snapshot,
  }).state;
  const generation = state.generation;
  state = machine.transition(state, {
    type: "IMPORT_OK",
    generation,
    slug,
    bundle,
    module,
    snapshot,
    theme,
  }).state;
  state = machine.transition(state, {
    type: "THEME_WINDOW_DONE",
    generation,
  }).state;
  state = machine.transition(state, {
    type: "MOUNT_SUCCEEDED",
    generation,
  }).state;
  state = machine.transition(state, {
    type: "FADE_IN_DONE",
    generation,
  }).state;

  return { state, bundle, snapshot };
}
