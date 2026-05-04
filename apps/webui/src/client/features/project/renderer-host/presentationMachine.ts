import type {
  RendererBundle,
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";
import type { RendererModule } from "./rendererRuntime.js";

/*
 * Renderer presentation machine — framework-agnostic pure reducer.
 *
 * Side effects (layer mount/clear, module import, timer schedule, theme emit)
 * are returned as commands. Async results (import resolution, timer fires)
 * are dispatched back as events. The reducer never invokes user code.
 *
 * Generation is a monotonic counter incremented on each REQUEST_SLUG. Stale
 * async events with mismatched generation are dropped via identity-equal
 * state and empty commands.
 *
 * Ownership boundary: this machine owns the entire host lifecycle (phase,
 * visibleError, generation). External callers (useProject, navigation
 * dispatch, etc.) do not emit lifecycle events into it — they feed inputs
 * (slug, bundle, snapshot, error) through the React adapter and observe
 * emitted state. RendererViewContext is a sibling server-data store, not
 * part of this lifecycle.
 */

export interface PresentationConfig {
  fadeOutMs: number;
  themeWindowMs: number;
  fadeInMs: number;
}

export type Phase =
  | "idle"
  | "stable"
  | "fading-out"
  | "waiting-for-import"
  | "applying-theme"
  | "mounting"
  | "fading-in"
  | "showing-error";

export type TimerKind = "fade-out" | "theme-window" | "fade-in";

export interface PreparedRenderer {
  slug: string;
  bundle: RendererBundle;
  module: RendererModule;
  snapshot: RendererSnapshot;
  theme: RendererTheme | null;
}

export interface PresentationState {
  readonly generation: number;
  readonly phase: Phase;
  readonly visibleSlug: string | null;
  readonly requestedSlug: string | null;
  readonly mounted: PreparedRenderer | null;
  readonly prepared: PreparedRenderer | null;
  readonly themeIdentity: string;
  readonly visibleError: string | null;
  readonly pendingError: string | null;
}

export type PresentationEvent =
  | { type: "REQUEST_SLUG"; slug: string | null }
  | {
      type: "BUNDLE_READY";
      slug: string;
      bundle: RendererBundle;
      snapshot: RendererSnapshot;
    }
  | { type: "SNAPSHOT_UPDATED"; slug: string; snapshot: RendererSnapshot }
  | { type: "ERROR_REPORTED"; message: string }
  | {
      type: "IMPORT_OK";
      generation: number;
      slug: string;
      bundle: RendererBundle;
      module: RendererModule;
      snapshot: RendererSnapshot;
      theme: RendererTheme | null;
    }
  | { type: "IMPORT_FAIL"; generation: number; message: string }
  | { type: "MOUNT_SUCCEEDED"; generation: number }
  | { type: "MOUNT_FAILED"; generation: number; message: string }
  | {
      type: "THEME_EVALUATED";
      generation: number;
      theme: RendererTheme | null;
    }
  | { type: "FADE_OUT_DONE"; generation: number }
  | { type: "THEME_WINDOW_DONE"; generation: number }
  | { type: "FADE_IN_DONE"; generation: number };

export type PresentationCommand =
  | {
      type: "import";
      generation: number;
      slug: string;
      bundle: RendererBundle;
      snapshot: RendererSnapshot;
    }
  | { type: "clearLayer" }
  | { type: "mount"; generation: number; prepared: PreparedRenderer }
  | { type: "updateSnapshot"; snapshot: RendererSnapshot }
  | {
      type: "evaluateTheme";
      generation: number;
      module: RendererModule;
      snapshot: RendererSnapshot;
    }
  | { type: "emitTheme"; theme: RendererTheme | null }
  | {
      type: "scheduleTimer";
      timer: TimerKind;
      generation: number;
      durationMs: number;
    }
  | { type: "cancelTimer" };

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

export function layerClassName(phase: Phase): string {
  const base = "relative z-10 h-full min-h-full";
  switch (phase) {
    case "fading-out":
      return `${base} opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0`;
    case "waiting-for-import":
    case "applying-theme":
    case "mounting":
      return `${base} opacity-0 transition-none`;
    case "fading-in":
    case "showing-error":
      return `${base} opacity-100 transition-opacity duration-200 ease-out motion-reduce:duration-0`;
    case "idle":
    case "stable":
      return `${base} opacity-100 transition-none`;
  }
}

function noop(state: PresentationState): TransitionResult {
  return { state, commands: [] };
}

function freshTheme(
  state: PresentationState,
  theme: RendererTheme | null,
): { identity: string; emit: PresentationCommand[] } {
  const identity = themeIdentity(theme);
  if (identity === state.themeIdentity) {
    return { identity, emit: [] };
  }
  return { identity, emit: [{ type: "emitTheme", theme }] };
}

export function createPresentationMachine(
  config: PresentationConfig,
): PresentationMachine {
  function initialState(): PresentationState {
    return {
      generation: 0,
      phase: "idle",
      visibleSlug: null,
      requestedSlug: null,
      mounted: null,
      prepared: null,
      themeIdentity: "null",
      visibleError: null,
      pendingError: null,
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
          visibleSlug: null,
          requestedSlug: null,
          mounted: null,
          prepared: null,
          themeIdentity: themeUpdate.identity,
          visibleError: null,
          pendingError: null,
        },
        commands: [
          { type: "cancelTimer" },
          { type: "clearLayer" },
          ...themeUpdate.emit,
        ],
      };
    }

    const isFirstRequest =
      state.visibleSlug === null && state.mounted === null;

    const baseState = {
      ...state,
      generation,
      requestedSlug: slug,
      prepared: null,
      visibleError: null,
      pendingError: null,
    };

    if (isFirstRequest) {
      return {
        state: { ...baseState, phase: "waiting-for-import" },
        commands: [{ type: "cancelTimer" }],
      };
    }

    return {
      state: { ...baseState, phase: "fading-out" },
      commands: [
        { type: "cancelTimer" },
        {
          type: "scheduleTimer",
          timer: "fade-out",
          generation,
          durationMs: config.fadeOutMs,
        },
      ],
    };
  }

  function onBundleReady(
    state: PresentationState,
    slug: string,
    bundle: RendererBundle,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (slug !== state.requestedSlug) return noop(state);

    // Same bundle for the same mounted slug: snapshot-only update path.
    if (
      state.mounted &&
      state.mounted.bundle === bundle &&
      state.mounted.slug === slug
    ) {
      return onSnapshotUpdated(state, slug, snapshot);
    }

    // No-op if we already prepared this exact bundle for the same slug.
    if (
      state.prepared &&
      state.prepared.bundle === bundle &&
      state.prepared.slug === slug
    ) {
      return noop(state);
    }

    return {
      state,
      commands: [
        {
          type: "import",
          generation: state.generation,
          slug,
          bundle,
          snapshot,
        },
      ],
    };
  }

  function onSnapshotUpdated(
    state: PresentationState,
    slug: string,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (
      !state.mounted ||
      state.mounted.slug !== slug ||
      state.visibleSlug !== slug
    ) {
      return noop(state);
    }

    const nextMounted = { ...state.mounted, snapshot };
    const commands: PresentationCommand[] = [
      { type: "updateSnapshot", snapshot },
    ];

    if (state.phase === "stable") {
      commands.push({
        type: "evaluateTheme",
        generation: state.generation,
        module: state.mounted.module,
        snapshot,
      });
    }

    return {
      state: { ...state, mounted: nextMounted },
      commands,
    };
  }

  function onErrorReported(
    state: PresentationState,
    message: string,
  ): TransitionResult {
    if (state.phase === "fading-out") {
      // Defer until fade-out completes; visual continuity preserved.
      return { state: { ...state, pendingError: message }, commands: [] };
    }
    return enterError(state, message);
  }

  function enterError(
    state: PresentationState,
    message: string,
  ): TransitionResult {
    const generation = state.generation + 1;
    const themeUpdate = freshTheme(state, null);
    return {
      state: {
        ...state,
        generation,
        phase: "showing-error",
        visibleSlug: state.requestedSlug,
        mounted: null,
        prepared: null,
        themeIdentity: themeUpdate.identity,
        visibleError: message,
        pendingError: null,
      },
      commands: [
        { type: "cancelTimer" },
        { type: "clearLayer" },
        ...themeUpdate.emit,
      ],
    };
  }

  function onImportOk(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "IMPORT_OK" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (event.slug !== state.requestedSlug) return noop(state);

    const prepared: PreparedRenderer = {
      slug: event.slug,
      bundle: event.bundle,
      module: event.module,
      snapshot: event.snapshot,
      theme: event.theme,
    };

    if (state.phase === "waiting-for-import") {
      return applyPrepared(state, prepared);
    }

    if (state.phase === "fading-out") {
      // Hold until fade-out completes; finishFadeOut will apply.
      return { state: { ...state, prepared }, commands: [] };
    }

    // In-place rebundle: same-slug bundle changed while stable (e.g., template
    // edit). Skip fade-out and run the theme/mount/fade-in sequence directly.
    if (state.phase === "stable" && state.visibleSlug === event.slug) {
      return applyPrepared(state, prepared);
    }

    return noop(state);
  }

  function applyPrepared(
    state: PresentationState,
    prepared: PreparedRenderer,
  ): TransitionResult {
    const themeUpdate = freshTheme(state, prepared.theme);
    return {
      state: {
        ...state,
        phase: "applying-theme",
        prepared,
        themeIdentity: themeUpdate.identity,
      },
      commands: [
        ...themeUpdate.emit,
        {
          type: "scheduleTimer",
          timer: "theme-window",
          generation: state.generation,
          durationMs: config.themeWindowMs,
        },
      ],
    };
  }

  function onImportFail(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "IMPORT_FAIL" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    return enterError(state, event.message);
  }

  function onMountSucceeded(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNT_SUCCEEDED" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "mounting") return noop(state);
    const prepared = state.prepared;
    if (!prepared) return noop(state);
    return {
      state: {
        ...state,
        phase: "fading-in",
        visibleSlug: prepared.slug,
        mounted: prepared,
        prepared: null,
        visibleError: null,
      },
      commands: [
        {
          type: "scheduleTimer",
          timer: "fade-in",
          generation: state.generation,
          durationMs: config.fadeInMs,
        },
      ],
    };
  }

  function onMountFailed(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNT_FAILED" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    return enterError(state, event.message);
  }

  function onThemeEvaluated(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "THEME_EVALUATED" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "stable") return noop(state);
    const themeUpdate = freshTheme(state, event.theme);
    if (themeUpdate.emit.length === 0) return noop(state);
    return {
      state: { ...state, themeIdentity: themeUpdate.identity },
      commands: themeUpdate.emit,
    };
  }

  function onFadeOutDone(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "FADE_OUT_DONE" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "fading-out") return noop(state);

    if (state.pendingError) {
      return enterError(state, state.pendingError);
    }

    if (state.prepared) {
      return applyPrepared(state, state.prepared);
    }

    return {
      state: {
        ...state,
        phase: "waiting-for-import",
        mounted: null,
      },
      commands: [{ type: "clearLayer" }],
    };
  }

  function onThemeWindowDone(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "THEME_WINDOW_DONE" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "applying-theme") return noop(state);
    const prepared = state.prepared;
    if (!prepared) return noop(state);

    return {
      state: {
        ...state,
        phase: "mounting",
      },
      commands: [{ type: "mount", generation: state.generation, prepared }],
    };
  }

  function onFadeInDone(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "FADE_IN_DONE" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "fading-in") return noop(state);
    return { state: { ...state, phase: "stable" }, commands: [] };
  }

  function transition(
    state: PresentationState,
    event: PresentationEvent,
  ): TransitionResult {
    switch (event.type) {
      case "REQUEST_SLUG":
        return onRequestSlug(state, event.slug);
      case "BUNDLE_READY":
        return onBundleReady(state, event.slug, event.bundle, event.snapshot);
      case "SNAPSHOT_UPDATED":
        return onSnapshotUpdated(state, event.slug, event.snapshot);
      case "ERROR_REPORTED":
        return onErrorReported(state, event.message);
      case "IMPORT_OK":
        return onImportOk(state, event);
      case "IMPORT_FAIL":
        return onImportFail(state, event);
      case "MOUNT_SUCCEEDED":
        return onMountSucceeded(state, event);
      case "MOUNT_FAILED":
        return onMountFailed(state, event);
      case "THEME_EVALUATED":
        return onThemeEvaluated(state, event);
      case "FADE_OUT_DONE":
        return onFadeOutDone(state, event);
      case "THEME_WINDOW_DONE":
        return onThemeWindowDone(state, event);
      case "FADE_IN_DONE":
        return onFadeInDone(state, event);
    }
  }

  return { initialState, transition };
}
