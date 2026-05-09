import type {
  RendererSnapshot,
  RendererTheme,
} from "@/client/entities/renderer/index.js";

/*
 * Renderer presentation machine — framework-agnostic pure reducer.
 *
 * Single-slot iframe lifecycle. The previous ShadowRoot/blob-URL backend ran
 * a multi-phase fade machine; the iframe transition (#179, ADR-0001) defers
 * cross-fade to a follow-up slice and uses just one mount slot. Our job is
 * to track which slug/digest is requested, whether the iframe has acked
 * MOUNTED, and what theme to publish to the host.
 *
 * Side effects (theme emission) are returned as commands. Async lifecycle
 * results (MOUNTED ack, IMPORT errors) are dispatched back as events.
 *
 * Generation is monotonic; bumped on each REQUEST_SLUG. Stale acks with
 * mismatched generation collapse to identity-equal noop.
 */

export type Phase =
  | "idle"
  | "loading"
  | "mounted"
  | "showing-error";

export interface PresentationState {
  readonly generation: number;
  readonly phase: Phase;
  readonly requestedSlug: string | null;
  readonly visibleSlug: string | null;
  readonly digest: string | null;
  readonly snapshot: RendererSnapshot | null;
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
    };

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
 * iframe wrapper className — opacity gate so we don't show pre-MOUNTED
 * placeholders. Initial mount and project switches both go through the
 * same loading→mounted transition; the wrapper hides the iframe until ack.
 */
export function iframeWrapperClassName(phase: Phase): string {
  const base = "absolute inset-0 transition-opacity duration-200 ease-out motion-reduce:duration-0";
  switch (phase) {
    case "mounted":
    case "showing-error":
      return `${base} opacity-100`;
    case "loading":
    case "idle":
      return `${base} opacity-0 pointer-events-none`;
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
  if (identity === state.themeIdentity) return { identity, emit: [] };
  return { identity, emit: [{ type: "emitTheme", theme }] };
}

export function createPresentationMachine(): PresentationMachine {
  function initialState(): PresentationState {
    return {
      generation: 0,
      phase: "idle",
      requestedSlug: null,
      visibleSlug: null,
      digest: null,
      snapshot: null,
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
    const themeUpdate = freshTheme(state, null);

    if (slug === null) {
      return {
        state: {
          generation,
          phase: "idle",
          requestedSlug: null,
          visibleSlug: null,
          digest: null,
          snapshot: null,
          themeIdentity: themeUpdate.identity,
          visibleError: null,
        },
        commands: themeUpdate.emit,
      };
    }

    return {
      state: {
        generation,
        phase: "loading",
        requestedSlug: slug,
        visibleSlug: null,
        digest: null,
        snapshot: null,
        themeIdentity: themeUpdate.identity,
        visibleError: null,
      },
      commands: themeUpdate.emit,
    };
  }

  function onDigestReady(
    state: PresentationState,
    slug: string,
    digest: string,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (slug !== state.requestedSlug) return noop(state);
    if (state.digest === digest && state.snapshot === snapshot) {
      return noop(state);
    }
    return {
      state: { ...state, digest, snapshot },
      commands: [],
    };
  }

  function onSnapshotUpdated(
    state: PresentationState,
    slug: string,
    snapshot: RendererSnapshot,
  ): TransitionResult {
    if (slug !== state.requestedSlug) return noop(state);
    if (state.snapshot === snapshot) return noop(state);
    return {
      state: { ...state, snapshot },
      commands: [],
    };
  }

  function onMounted(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNTED" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "loading") return noop(state);
    if (state.requestedSlug === null) return noop(state);

    const themeUpdate = freshTheme(state, event.theme);
    return {
      state: {
        ...state,
        phase: "mounted",
        visibleSlug: state.requestedSlug,
        themeIdentity: themeUpdate.identity,
        visibleError: null,
      },
      commands: themeUpdate.emit,
    };
  }

  function onMountFailed(
    state: PresentationState,
    event: Extract<PresentationEvent, { type: "MOUNT_FAILED" }>,
  ): TransitionResult {
    if (event.generation !== state.generation) return noop(state);
    return enterError(state, event.message);
  }

  function onErrorReported(
    state: PresentationState,
    message: string,
  ): TransitionResult {
    if (state.visibleError === message) return noop(state);
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
    if (event.generation !== state.generation) return noop(state);
    if (state.phase !== "mounted") return noop(state);
    const themeUpdate = freshTheme(state, event.theme);
    if (themeUpdate.emit.length === 0) return noop(state);
    return {
      state: { ...state, themeIdentity: themeUpdate.identity },
      commands: themeUpdate.emit,
    };
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
    }
  }

  return { initialState, transition };
}
