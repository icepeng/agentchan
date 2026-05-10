import type {
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";

/*
 * Renderer presentation machine — framework-agnostic pure reducer.
 *
 * Two-slot iframe lifecycle. We keep at most two slots alive at once: a
 * `prev` slot that was previously visible and is fading out, and a `cur`
 * slot that is mounting / fading in / showing. Cross-fade overlap means
 * the new bundle starts importing while the old slot is still on screen,
 * so user-perceived swap latency shrinks.
 *
 * Two race-gates control when the new slot becomes the visible one:
 *
 *   FADE_OUT_DONE(prev) && MOUNTED(cur)
 *
 * Whichever gate trips second drops `prev` and flips `cur` into the
 * fading-in phase. The MOUNTED ack carries an atomic `theme` payload that
 * the host buffers and applies in the same step that drops `prev`, so the
 * old iframe and old theme always disappear together.
 *
 * Generation is monotonic; bumped on each REQUEST_SLUG. Every async ack
 * (MOUNTED, FADE_OUT_DONE, FADE_IN_DONE, MOUNT_FAILED, THEME_PUSHED)
 * carries the slot's generation so stale callbacks from torn-down iframes
 * collapse to identity-equal noops.
 *
 * Side effects (theme emission) are returned as commands.
 */

export type Phase =
  | "idle"
  | "mounting"
  | "transitioning"
  | "fading-in"
  | "showing"
  | "showing-error";

export interface SlotState {
  readonly slug: string;
  readonly generation: number;
  readonly digest: string | null;
  readonly snapshot: RendererSnapshot | null;
  readonly mountedAck: boolean;
  /** Theme buffered from MOUNTED / THEME_PUSHED, awaiting gate clearance. */
  readonly bufferedTheme: RendererTheme | null;
  /** True once bufferedTheme has been emitted to the host. */
  readonly themeApplied: boolean;
}

export interface PresentationState {
  readonly generation: number;
  readonly phase: Phase;
  readonly requestedSlug: string | null;
  /** Slot fading out (or about to). Only set during `transitioning`. */
  readonly prev: SlotState | null;
  /** Slot mounting / fading in / shown. */
  readonly cur: SlotState | null;
  /** Latched FADE_OUT_DONE for `prev` while waiting on MOUNTED. */
  readonly fadeOutDone: boolean;
  readonly themeIdentity: string;
  readonly visibleError: string | null;
}

export type PresentationEvent =
  | { type: "REQUEST_SLUG"; slug: string | null }
  | {
      type: "DIGEST_READY";
      slug: string;
      digest: string;
      snapshot: RendererSnapshot;
    }
  | { type: "SNAPSHOT_UPDATED"; slug: string; snapshot: RendererSnapshot }
  | {
      type: "MOUNTED";
      generation: number;
      theme: RendererTheme | null;
    }
  | { type: "MOUNT_FAILED"; generation: number; message: string }
  | { type: "ERROR_REPORTED"; message: string }
  | {
      type: "THEME_PUSHED";
      generation: number;
      theme: RendererTheme | null;
    }
  | { type: "FADE_OUT_DONE"; generation: number }
  | { type: "FADE_IN_DONE"; generation: number };

export type PresentationCommand = {
  type: "emitTheme";
  theme: RendererTheme | null;
};

export interface TransitionResult {
  state: PresentationState;
  commands: PresentationCommand[];
}

export interface PresentationMachine {
  initialState(): PresentationState;
  transition(
    state: PresentationState,
    event: PresentationEvent,
  ): TransitionResult;
}

export function themeIdentity(theme: RendererTheme | null): string {
  if (theme === null) return "null";
  return JSON.stringify({
    base: sortedTokens(theme.base),
    dark: sortedTokens(theme.dark ?? {}),
    prefersScheme: theme.prefersScheme ?? null,
  });
}

function sortedTokens(
  tokens: Partial<RendererTheme["base"]>,
): [string, string][] {
  return Object.entries(tokens)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Per-slot visual state. Drives the opacity class so CSS transitions fire
 * on class changes (mounting → fading-in, showing → fading-out).
 */
export type SlotVisualState =
  | "mounting"
  | "fading-in"
  | "showing"
  | "fading-out";

const FADE_IN = "transition-opacity duration-200 ease-out motion-reduce:duration-0";
const FADE_OUT = "transition-opacity duration-300 ease-out motion-reduce:duration-0";

/**
 * Tailwind className for a slot wrapper based on its visual state. Both
 * slots stack via `absolute inset-0`; opacity drives the cross-fade.
 */
export function slotWrapperClassName(state: SlotVisualState): string {
  switch (state) {
    case "mounting":
      return `absolute inset-0 ${FADE_IN} opacity-0 pointer-events-none`;
    case "fading-in":
      return `absolute inset-0 ${FADE_IN} opacity-100`;
    case "showing":
      return `absolute inset-0 ${FADE_IN} opacity-100`;
    case "fading-out":
      return `absolute inset-0 ${FADE_OUT} opacity-0 pointer-events-none`;
  }
}

export interface RenderedSlot {
  /** React key — stable for a slot's lifetime. */
  readonly key: string;
  readonly slug: string;
  readonly digest: string;
  readonly generation: number;
  readonly role: "prev" | "cur";
  readonly visualState: SlotVisualState;
}

/**
 * Project the machine state to the list of slots the React tree should
 * render. Slots without a digest (cur waiting on DIGEST_READY) are omitted
 * — the iframe src needs both slug + digest.
 */
export function selectSlots(state: PresentationState): RenderedSlot[] {
  const slots: RenderedSlot[] = [];
  if (state.prev && state.prev.digest) {
    slots.push({
      key: `slot-${state.prev.generation}`,
      slug: state.prev.slug,
      digest: state.prev.digest,
      generation: state.prev.generation,
      role: "prev",
      visualState: "fading-out",
    });
  }
  if (state.cur && state.cur.digest) {
    let visualState: SlotVisualState;
    switch (state.phase) {
      case "mounting":
      case "transitioning":
        visualState = "mounting";
        break;
      case "fading-in":
        visualState = "fading-in";
        break;
      case "showing":
        visualState = "showing";
        break;
      default:
        visualState = "mounting";
    }
    slots.push({
      key: `slot-${state.cur.generation}`,
      slug: state.cur.slug,
      digest: state.cur.digest,
      generation: state.cur.generation,
      role: "cur",
      visualState,
    });
  }
  return slots;
}

function noop(state: PresentationState): TransitionResult {
  return { state, commands: [] };
}

function freshTheme(
  state: PresentationState,
  theme: RendererTheme | null,
): { identity: string; emit: PresentationCommand[] } {
  const identity = themeIdentity(theme);
  if (identity === state.themeIdentity) return { identity, emit: [] };
  return { identity, emit: [{ type: "emitTheme", theme }] };
}

function newSlot(slug: string, generation: number): SlotState {
  return {
    slug,
    generation,
    digest: null,
    snapshot: null,
    mountedAck: false,
    bufferedTheme: null,
    themeApplied: false,
  };
}

export function createPresentationMachine(): PresentationMachine {
  function initialState(): PresentationState {
    return {
      generation: 0,
      phase: "idle",
      requestedSlug: null,
      prev: null,
      cur: null,
      fadeOutDone: false,
      themeIdentity: "null",
      visibleError: null,
    };
  }

  function onRequestSlug(
    state: PresentationState,
    slug: string | null,
  ): TransitionResult {
    if (slug === state.requestedSlug) return noop(state);

    const generation = state.generation + 1;

    if (slug === null) {
      const themeUpdate = freshTheme(state, null);
      return {
        state: {
          generation,
          phase: "idle",
          requestedSlug: null,
          prev: null,
          cur: null,
          fadeOutDone: false,
          themeIdentity: themeUpdate.identity,
          visibleError: null,
        },
        commands: themeUpdate.emit,
      };
    }

    const cur = newSlot(slug, generation);

    switch (state.phase) {
      case "idle":
      case "showing-error": {
        // No visible slot to keep; clear theme and start fresh.
        const themeUpdate = freshTheme(state, null);
        return {
          state: {
            generation,
            phase: "mounting",
            requestedSlug: slug,
            prev: null,
            cur,
            fadeOutDone: false,
            themeIdentity: themeUpdate.identity,
            visibleError: null,
          },
          commands: themeUpdate.emit,
        };
      }
      case "mounting": {
        // Replace pending cur. No prev to preserve; theme already null.
        return {
          state: {
            ...state,
            generation,
            requestedSlug: slug,
            cur,
            fadeOutDone: false,
            visibleError: null,
          },
          commands: [],
        };
      }
      case "showing":
      case "fading-in": {
        // Move cur → prev (start fading out). Old theme stays applied
        // until both gates pass.
        return {
          state: {
            ...state,
            generation,
            phase: "transitioning",
            requestedSlug: slug,
            prev: state.cur,
            cur,
            fadeOutDone: false,
            visibleError: null,
          },
          commands: [],
        };
      }
      case "transitioning": {
        // A→B→C: prev keeps fading out, replace the pending cur. The old
        // pending slot's MOUNTED ack will be ignored on generation mismatch.
        return {
          state: {
            ...state,
            generation,
            requestedSlug: slug,
            cur,
            visibleError: null,
          },
          commands: [],
        };
      }
    }
  }

  function onDigestReady(
    state: PresentationState,
    slug: string,
    digest: string,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (!state.cur || state.cur.slug !== slug) return noop(state);
    if (state.cur.digest === digest && state.cur.snapshot === snapshot) {
      return noop(state);
    }
    return {
      state: { ...state, cur: { ...state.cur, digest, snapshot } },
      commands: [],
    };
  }

  function onSnapshotUpdated(
    state: PresentationState,
    slug: string,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (!state.cur || state.cur.slug !== slug) return noop(state);
    if (state.cur.snapshot === snapshot) return noop(state);
    return {
      state: { ...state, cur: { ...state.cur, snapshot } },
      commands: [],
    };
  }

  function onMounted(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNTED" }>,
  ): TransitionResult {
    if (!state.cur || event.generation !== state.cur.generation) {
      return noop(state);
    }
    if (state.cur.mountedAck) return noop(state);

    const ackedCur: SlotState = {
      ...state.cur,
      mountedAck: true,
      bufferedTheme: event.theme,
    };

    if (state.phase === "mounting") {
      // No prev to wait on — apply theme and enter fading-in.
      const themeUpdate = freshTheme(state, event.theme);
      return {
        state: {
          ...state,
          phase: "fading-in",
          cur: { ...ackedCur, themeApplied: true },
          themeIdentity: themeUpdate.identity,
        },
        commands: themeUpdate.emit,
      };
    }

    if (state.phase === "transitioning") {
      if (state.fadeOutDone) {
        // Both gates clear — drop prev, apply theme, fade in.
        const themeUpdate = freshTheme(state, event.theme);
        return {
          state: {
            ...state,
            phase: "fading-in",
            prev: null,
            cur: { ...ackedCur, themeApplied: true },
            fadeOutDone: false,
            themeIdentity: themeUpdate.identity,
          },
          commands: themeUpdate.emit,
        };
      }
      // FADE_OUT_DONE not yet — buffer ack + theme.
      return {
        state: { ...state, cur: ackedCur },
        commands: [],
      };
    }

    return noop(state);
  }

  function onFadeOutDone(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "FADE_OUT_DONE" }>,
  ): TransitionResult {
    if (state.phase !== "transitioning") return noop(state);
    if (!state.prev || event.generation !== state.prev.generation) {
      return noop(state);
    }
    if (state.fadeOutDone) return noop(state);

    if (state.cur?.mountedAck) {
      // Both gates clear — drop prev, apply buffered theme, fade in.
      const themeUpdate = freshTheme(state, state.cur.bufferedTheme);
      return {
        state: {
          ...state,
          phase: "fading-in",
          prev: null,
          cur: { ...state.cur, themeApplied: true },
          fadeOutDone: false,
          themeIdentity: themeUpdate.identity,
        },
        commands: themeUpdate.emit,
      };
    }
    // MOUNTED not yet — latch the gate, keep prev rendered.
    return {
      state: { ...state, fadeOutDone: true },
      commands: [],
    };
  }

  function onFadeInDone(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "FADE_IN_DONE" }>,
  ): TransitionResult {
    if (state.phase !== "fading-in") return noop(state);
    if (!state.cur || event.generation !== state.cur.generation) {
      return noop(state);
    }
    return {
      state: { ...state, phase: "showing" },
      commands: [],
    };
  }

  function onMountFailed(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNT_FAILED" }>,
  ): TransitionResult {
    if (!state.cur || event.generation !== state.cur.generation) {
      return noop(state);
    }
    return enterError(state, event.message);
  }

  function onErrorReported(
    state: PresentationState,
    message: string,
  ): TransitionResult {
    if (state.phase === "showing-error" && state.visibleError === message) {
      return noop(state);
    }
    return enterError(state, message);
  }

  function enterError(
    state: PresentationState,
    message: string,
  ): TransitionResult {
    const themeUpdate = freshTheme(state, null);
    return {
      state: {
        ...state,
        phase: "showing-error",
        prev: null,
        cur: null,
        fadeOutDone: false,
        themeIdentity: themeUpdate.identity,
        visibleError: message,
      },
      commands: themeUpdate.emit,
    };
  }

  function onThemePushed(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "THEME_PUSHED" }>,
  ): TransitionResult {
    if (!state.cur || event.generation !== state.cur.generation) {
      return noop(state);
    }

    if (state.phase === "fading-in" || state.phase === "showing") {
      const themeUpdate = freshTheme(state, event.theme);
      // Identity match — already applied, identity-equal noop.
      if (themeUpdate.emit.length === 0) return noop(state);
      return {
        state: {
          ...state,
          cur: {
            ...state.cur,
            bufferedTheme: event.theme,
            themeApplied: true,
          },
          themeIdentity: themeUpdate.identity,
        },
        commands: themeUpdate.emit,
      };
    }

    if (state.phase === "mounting" || state.phase === "transitioning") {
      // Buffer until gates pass — old theme stays visible meanwhile.
      if (state.cur.bufferedTheme === event.theme) return noop(state);
      return {
        state: { ...state, cur: { ...state.cur, bufferedTheme: event.theme } },
        commands: [],
      };
    }

    return noop(state);
  }

  function transition(
    state: PresentationState,
    event: PresentationEvent,
  ): TransitionResult {
    switch (event.type) {
      case "REQUEST_SLUG":
        return onRequestSlug(state, event.slug);
      case "DIGEST_READY":
        return onDigestReady(state, event.slug, event.digest, event.snapshot);
      case "SNAPSHOT_UPDATED":
        return onSnapshotUpdated(state, event.slug, event.snapshot);
      case "MOUNTED":
        return onMounted(state, event);
      case "MOUNT_FAILED":
        return onMountFailed(state, event);
      case "ERROR_REPORTED":
        return onErrorReported(state, event.message);
      case "THEME_PUSHED":
        return onThemePushed(state, event);
      case "FADE_OUT_DONE":
        return onFadeOutDone(state, event);
      case "FADE_IN_DONE":
        return onFadeInDone(state, event);
    }
  }

  return { initialState, transition };
}
