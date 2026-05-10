import { describe, test, expect } from "bun:test";
import {
  createPresentationMachine,
  selectSlots,
  slotWrapperClassName,
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

// Drive a slug all the way from idle → showing.
function driveToShowing(
  machine: PresentationMachine,
  slug: string,
  theme: RendererTheme | null = null,
): { state: PresentationState; digest: string } {
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
    generation: state.cur!.generation,
    theme,
  }).state;
  state = machine.transition(state, {
    type: "FADE_IN_DONE",
    generation: state.cur!.generation,
  }).state;
  return { state, digest };
}

// --- Tests ------------------------------------------------------------------

describe("createPresentationMachine — initial state", () => {
  test("starts idle with both slots null", () => {
    const m = createPresentationMachine();
    const s = m.initialState();
    expect(s.phase).toBe("idle");
    expect(s.generation).toBe(0);
    expect(s.requestedSlug).toBeNull();
    expect(s.prev).toBeNull();
    expect(s.cur).toBeNull();
    expect(s.fadeOutDone).toBe(false);
    expect(s.themeIdentity).toBe("null");
    expect(s.visibleError).toBeNull();
  });
});

describe("REQUEST_SLUG", () => {
  test("first request transitions to mounting + bumps generation", () => {
    const m = createPresentationMachine();
    const { state } = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]);
    expect(state.phase).toBe("mounting");
    expect(state.requestedSlug).toBe("alpha");
    expect(state.generation).toBe(1);
    expect(state.cur?.slug).toBe("alpha");
    expect(state.cur?.generation).toBe(1);
    expect(state.cur?.mountedAck).toBe(false);
    expect(state.prev).toBeNull();
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

  test("REQUEST_SLUG null while showing → idle, emits null theme", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const { state, commands } = step(m, showing.state, [
      { type: "REQUEST_SLUG", slug: null },
    ]);
    expect(state.phase).toBe("idle");
    expect(state.requestedSlug).toBeNull();
    expect(state.prev).toBeNull();
    expect(state.cur).toBeNull();
    expect(state.themeIdentity).toBe("null");
    expect(commandTypes(commands)).toEqual(["emitTheme"]);
    expect(commands[0]).toEqual({ type: "emitTheme", theme: null });
  });

  test("REQUEST_SLUG to a different slug while showing → transitioning, theme preserved", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const themeBefore = showing.state.themeIdentity;

    const { state, commands } = step(m, showing.state, [
      { type: "REQUEST_SLUG", slug: "beta" },
    ]);
    expect(state.phase).toBe("transitioning");
    expect(state.requestedSlug).toBe("beta");
    expect(state.prev?.slug).toBe("alpha");
    expect(state.cur?.slug).toBe("beta");
    expect(state.cur?.generation).toBe(state.generation);
    expect(state.fadeOutDone).toBe(false);
    // Old theme stays applied during fade-out window.
    expect(state.themeIdentity).toBe(themeBefore);
    expect(commands).toEqual([]);
  });

  test("REQUEST_SLUG during fading-in moves cur → prev", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    }).state;
    state = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: makeTheme("red"),
    }).state;
    expect(state.phase).toBe("fading-in");

    const next = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" });
    expect(next.state.phase).toBe("transitioning");
    expect(next.state.prev?.slug).toBe("alpha");
    expect(next.state.cur?.slug).toBe("beta");
    expect(next.state.fadeOutDone).toBe(false);
  });

  test("REQUEST_SLUG during transitioning replaces cur, prev unchanged", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    const prevAtStart = state.prev;
    expect(state.prev?.slug).toBe("alpha");
    expect(state.cur?.slug).toBe("beta");
    const beta = state.cur!.generation;

    state = m.transition(state, { type: "REQUEST_SLUG", slug: "gamma" }).state;
    expect(state.phase).toBe("transitioning");
    expect(state.prev).toBe(prevAtStart); // identity-stable
    expect(state.cur?.slug).toBe("gamma");
    expect(state.cur?.generation).toBeGreaterThan(beta);
  });

  test("REQUEST_SLUG during mounting replaces cur, no prev", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    expect(state.phase).toBe("mounting");

    state = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" }).state;
    expect(state.phase).toBe("mounting");
    expect(state.prev).toBeNull();
    expect(state.cur?.slug).toBe("beta");
    expect(state.cur?.generation).toBe(state.generation);
  });

  test("REQUEST_SLUG from showing-error clears error + emits null theme if non-null", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "ERROR_REPORTED",
      message: "boom",
    }).state;
    expect(state.phase).toBe("showing-error");

    const result = m.transition(state, { type: "REQUEST_SLUG", slug: "beta" });
    expect(result.state.phase).toBe("mounting");
    expect(result.state.cur?.slug).toBe("beta");
    expect(result.state.visibleError).toBeNull();
    // showing-error already cleared theme to null, so no extra emit.
    expect(result.commands).toEqual([]);
  });
});

describe("DIGEST_READY", () => {
  test("stores digest + snapshot when slug matches cur", () => {
    const m = createPresentationMachine();
    const requested = step(m, m.initialState(), [
      { type: "REQUEST_SLUG", slug: "alpha" },
    ]).state;
    const snapshot = makeSnapshot("alpha");
    const { state, commands } = step(m, requested, [
      { type: "DIGEST_READY", slug: "alpha", digest: "x1", snapshot },
    ]);
    expect(state.cur?.digest).toBe("x1");
    expect(state.cur?.snapshot).toBe(snapshot);
    expect(state.phase).toBe("mounting"); // still waiting on MOUNTED ack
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

describe("MOUNTED ack — initial mount", () => {
  test("happy path: REQUEST → DIGEST_READY → MOUNTED → fading-in + emit theme", () => {
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
    const result = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme,
    });
    expect(result.state.phase).toBe("fading-in");
    expect(result.state.cur?.mountedAck).toBe(true);
    expect(result.state.cur?.themeApplied).toBe(true);
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
    expect(result.commands[0]).toEqual({ type: "emitTheme", theme });
  });

  test("MOUNTED with stale generation is dropped", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    const stale = state.cur!.generation;
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

  test("FADE_IN_DONE → showing", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    }).state;
    state = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: null,
    }).state;
    expect(state.phase).toBe("fading-in");

    state = m.transition(state, {
      type: "FADE_IN_DONE",
      generation: state.cur!.generation,
    }).state;
    expect(state.phase).toBe("showing");
    expect(state.cur?.slug).toBe("alpha");
  });

  test("FADE_IN_DONE with stale generation is dropped", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const stale = showing.state.cur!.generation - 99;

    const result = m.transition(showing.state, {
      type: "FADE_IN_DONE",
      generation: stale,
    });
    expect(result.state).toBe(showing.state);
  });
});

describe("MOUNTED ack — transitioning race gates", () => {
  test("FADE_OUT_DONE first, MOUNTED second → fading-in on MOUNTED", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "beta",
      digest: "x2",
      snapshot: makeSnapshot("beta"),
    }).state;

    // FADE_OUT_DONE arrives first.
    const fadeOut = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: state.prev!.generation,
    });
    expect(fadeOut.state.phase).toBe("transitioning");
    expect(fadeOut.state.fadeOutDone).toBe(true);
    expect(fadeOut.state.prev?.slug).toBe("alpha"); // still rendered
    expect(fadeOut.commands).toEqual([]);

    // MOUNTED arrives second, gates clear.
    const mountedTheme = makeTheme("blue");
    const mounted = m.transition(fadeOut.state, {
      type: "MOUNTED",
      generation: fadeOut.state.cur!.generation,
      theme: mountedTheme,
    });
    expect(mounted.state.phase).toBe("fading-in");
    expect(mounted.state.prev).toBeNull();
    expect(mounted.state.cur?.themeApplied).toBe(true);
    expect(commandTypes(mounted.commands)).toEqual(["emitTheme"]);
    expect(mounted.commands[0]).toEqual({
      type: "emitTheme",
      theme: mountedTheme,
    });
  });

  test("MOUNTED first, FADE_OUT_DONE second → fading-in on FADE_OUT_DONE", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "beta",
      digest: "x2",
      snapshot: makeSnapshot("beta"),
    }).state;

    // MOUNTED first — theme is buffered, prev still rendered.
    const mountedTheme = makeTheme("blue");
    const mounted = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: mountedTheme,
    });
    expect(mounted.state.phase).toBe("transitioning");
    expect(mounted.state.cur?.mountedAck).toBe(true);
    expect(mounted.state.cur?.bufferedTheme).toBe(mountedTheme);
    expect(mounted.state.cur?.themeApplied).toBe(false);
    expect(mounted.state.prev?.slug).toBe("alpha");
    // Old theme still applied — no command yet.
    expect(mounted.commands).toEqual([]);

    // FADE_OUT_DONE arrives second, gates clear.
    const fadeOut = m.transition(mounted.state, {
      type: "FADE_OUT_DONE",
      generation: mounted.state.prev!.generation,
    });
    expect(fadeOut.state.phase).toBe("fading-in");
    expect(fadeOut.state.prev).toBeNull();
    expect(fadeOut.state.cur?.themeApplied).toBe(true);
    expect(commandTypes(fadeOut.commands)).toEqual(["emitTheme"]);
    expect(fadeOut.commands[0]).toEqual({
      type: "emitTheme",
      theme: mountedTheme,
    });
  });
});

describe("FADE_OUT_DONE", () => {
  test("ignores FADE_OUT_DONE for stale generation", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    expect(state.prev?.slug).toBe("alpha");

    const result = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: 999,
    });
    expect(result.state).toBe(state);
    expect(result.commands).toEqual([]);
  });

  test("noop when not transitioning", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const result = m.transition(showing.state, {
      type: "FADE_OUT_DONE",
      generation: showing.state.cur!.generation,
    });
    expect(result.state).toBe(showing.state);
  });
});

describe("A → B → C consecutive transition", () => {
  test("REQUEST_SLUG(C) during transitioning(A→B) replaces cur to C, prev=A", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    const prevAtAB = state.prev;
    const betaGen = state.cur!.generation;

    state = m.transition(state, { type: "REQUEST_SLUG", slug: "gamma" }).state;
    expect(state.phase).toBe("transitioning");
    expect(state.prev).toBe(prevAtAB); // A still fading out
    expect(state.cur?.slug).toBe("gamma");
    expect(state.cur?.generation).toBeGreaterThan(betaGen);

    // Stale MOUNTED for B is ignored.
    const stale = m.transition(state, {
      type: "MOUNTED",
      generation: betaGen,
      theme: makeTheme("blue"),
    });
    expect(stale.state).toBe(state);
    expect(stale.commands).toEqual([]);

    // C completes both gates.
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "gamma",
      digest: "x3",
      snapshot: makeSnapshot("gamma"),
    }).state;
    state = m.transition(state, {
      type: "FADE_OUT_DONE",
      generation: state.prev!.generation,
    }).state;
    expect(state.phase).toBe("transitioning");
    expect(state.fadeOutDone).toBe(true);

    const gammaTheme = makeTheme("green");
    const final = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: gammaTheme,
    });
    expect(final.state.phase).toBe("fading-in");
    expect(final.state.cur?.slug).toBe("gamma");
    expect(final.state.prev).toBeNull();
    expect(final.commands).toEqual([{ type: "emitTheme", theme: gammaTheme }]);
  });

  test("MOUNTED arrival mid fade-out then re-request: stale ack discarded", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "beta",
      digest: "x2",
      snapshot: makeSnapshot("beta"),
    }).state;

    // B mounted but FADE_OUT not yet — still transitioning.
    const betaGen = state.cur!.generation;
    state = m.transition(state, {
      type: "MOUNTED",
      generation: betaGen,
      theme: makeTheme("blue"),
    }).state;
    expect(state.phase).toBe("transitioning");

    // User switches to C before fade-out completes.
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "gamma" }).state;
    expect(state.cur?.slug).toBe("gamma");
    expect(state.cur?.mountedAck).toBe(false);
    expect(state.cur?.bufferedTheme).toBeNull();
  });
});

describe("MOUNT_FAILED + ERROR_REPORTED", () => {
  test("MOUNT_FAILED clears prev + cur, emits null theme", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;

    const result = m.transition(state, {
      type: "MOUNT_FAILED",
      generation: state.cur!.generation,
      message: "boom",
    });
    expect(result.state.phase).toBe("showing-error");
    expect(result.state.prev).toBeNull();
    expect(result.state.cur).toBeNull();
    expect(result.state.visibleError).toBe("boom");
    expect(result.state.themeIdentity).toBe("null");
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
  });

  test("MOUNT_FAILED with stale generation is dropped", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const result = m.transition(showing.state, {
      type: "MOUNT_FAILED",
      generation: 999,
      message: "stale",
    });
    expect(result.state).toBe(showing.state);
  });

  test("ERROR_REPORTED transitions to showing-error", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const result = m.transition(showing.state, {
      type: "ERROR_REPORTED",
      message: "404",
    });
    expect(result.state.phase).toBe("showing-error");
    expect(result.state.visibleError).toBe("404");
    expect(result.state.cur).toBeNull();
  });
});

describe("THEME_PUSHED", () => {
  test("emits theme when phase is showing", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const next = makeTheme("blue");
    const result = m.transition(showing.state, {
      type: "THEME_PUSHED",
      generation: showing.state.cur!.generation,
      theme: next,
    });
    expect(commandTypes(result.commands)).toEqual(["emitTheme"]);
    expect(result.commands[0]).toEqual({ type: "emitTheme", theme: next });
  });

  test("THEME_PUSHED with same identity is identity-equal noop", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const result = m.transition(showing.state, {
      type: "THEME_PUSHED",
      generation: showing.state.cur!.generation,
      theme: makeTheme("red"),
    });
    expect(result.state).toBe(showing.state);
    expect(result.commands).toEqual([]);
  });

  test("THEME_PUSHED during transitioning buffers, no emit", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "beta",
      digest: "x2",
      snapshot: makeSnapshot("beta"),
    }).state;

    const themeBefore = state.themeIdentity;
    const newTheme = makeTheme("blue");
    const result = m.transition(state, {
      type: "THEME_PUSHED",
      generation: state.cur!.generation,
      theme: newTheme,
    });
    expect(result.commands).toEqual([]);
    expect(result.state.themeIdentity).toBe(themeBefore);
    expect(result.state.cur?.bufferedTheme).toBe(newTheme);
    expect(result.state.cur?.themeApplied).toBe(false);
  });

  test("THEME_PUSHED with stale generation is dropped", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    const stale = showing.state.cur!.generation;
    const switched = m.transition(showing.state, {
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

describe("slotWrapperClassName mapping", () => {
  test("opacity reflects visual state", () => {
    expect(slotWrapperClassName("mounting")).toContain("opacity-0");
    expect(slotWrapperClassName("mounting")).toContain("pointer-events-none");
    expect(slotWrapperClassName("fading-in")).toContain("opacity-100");
    expect(slotWrapperClassName("showing")).toContain("opacity-100");
    expect(slotWrapperClassName("fading-out")).toContain("opacity-0");
    expect(slotWrapperClassName("fading-out")).toContain("pointer-events-none");
  });
});

describe("selectSlots", () => {
  test("idle has no slots", () => {
    const m = createPresentationMachine();
    expect(selectSlots(m.initialState())).toEqual([]);
  });

  test("mounting omits cur until digest is set", () => {
    const m = createPresentationMachine();
    let state = m.transition(m.initialState(), {
      type: "REQUEST_SLUG",
      slug: "alpha",
    }).state;
    expect(selectSlots(state)).toEqual([]);

    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    }).state;
    const slots = selectSlots(state);
    expect(slots.length).toBe(1);
    expect(slots[0].slug).toBe("alpha");
    expect(slots[0].role).toBe("cur");
    expect(slots[0].visualState).toBe("mounting");
  });

  test("transitioning yields prev (fading-out) + cur (mounting)", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", makeTheme("red"));
    let state = m.transition(showing.state, {
      type: "REQUEST_SLUG",
      slug: "beta",
    }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "beta",
      digest: "x2",
      snapshot: makeSnapshot("beta"),
    }).state;

    const slots = selectSlots(state);
    expect(slots.length).toBe(2);
    expect(slots[0].role).toBe("prev");
    expect(slots[0].slug).toBe("alpha");
    expect(slots[0].visualState).toBe("fading-out");
    expect(slots[1].role).toBe("cur");
    expect(slots[1].slug).toBe("beta");
    expect(slots[1].visualState).toBe("mounting");
  });

  test("fading-in yields only cur with fading-in state", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    }).state;
    state = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: null,
    }).state;
    expect(state.phase).toBe("fading-in");

    const slots = selectSlots(state);
    expect(slots.length).toBe(1);
    expect(slots[0].role).toBe("cur");
    expect(slots[0].visualState).toBe("fading-in");
  });

  test("showing yields only cur with showing state", () => {
    const m = createPresentationMachine();
    const showing = driveToShowing(m, "alpha", null);
    const slots = selectSlots(showing.state);
    expect(slots.length).toBe(1);
    expect(slots[0].role).toBe("cur");
    expect(slots[0].visualState).toBe("showing");
  });

  test("slot keys are stable across state transitions for a given generation", () => {
    const m = createPresentationMachine();
    let state = m.initialState();
    state = m.transition(state, { type: "REQUEST_SLUG", slug: "alpha" }).state;
    state = m.transition(state, {
      type: "DIGEST_READY",
      slug: "alpha",
      digest: "x1",
      snapshot: makeSnapshot("alpha"),
    }).state;
    const keyMounting = selectSlots(state)[0].key;

    state = m.transition(state, {
      type: "MOUNTED",
      generation: state.cur!.generation,
      theme: null,
    }).state;
    const keyFadingIn = selectSlots(state)[0].key;

    state = m.transition(state, {
      type: "FADE_IN_DONE",
      generation: state.cur!.generation,
    }).state;
    const keyShowing = selectSlots(state)[0].key;

    expect(keyMounting).toBe(keyFadingIn);
    expect(keyFadingIn).toBe(keyShowing);
  });
});
