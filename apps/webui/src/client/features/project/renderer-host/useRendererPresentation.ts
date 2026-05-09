/* oxlint-disable react-hooks-js/set-state-in-effect -- Adapter dispatches presentation events from external project/output state. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from "react";
import {
  subscribeAgentEvents,
  useAgentState,
  type AgentState,
} from "@/client/entities/agent-state/index.js";
import {
  type RendererActions,
  type RendererSnapshot,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import type {
  HydratePayload,
  ProjectFile,
  RendererHostApi,
  RendererShellApi,
} from "@agentchan/renderer/host";
import {
  createPresentationMachine,
  selectSlots,
  slotWrapperClassName,
  type PresentationCommand,
  type PresentationEvent,
  type PresentationState,
  type RenderedSlot,
} from "./presentationMachine.js";

interface Options {
  actions: RendererActions;
  activeProjectSlug: string | null;
  digest: string | null;
  snapshot: RendererSnapshot | null;
  error: string | null;
  scheme: "light" | "dark";
  onTheme: (theme: RendererTheme | null) => void;
}

export interface PresentationSlot extends RenderedSlot {
  className: string;
  hostHandlers: RendererHostApi;
  onShellReady: (shell: RendererShellApi | null) => void;
  onTransitionEnd: (event: TransitionEvent) => void;
}

interface RendererPresentation {
  slots: ReadonlyArray<PresentationSlot>;
  visibleError: string | null;
}

function toHydratePayload(
  slug: string,
  baseUrl: string,
  state: AgentState,
  files: readonly ProjectFile[],
): HydratePayload {
  return {
    slug,
    baseUrl,
    state,
    files,
  };
}

export function useRendererPresentation({
  actions,
  activeProjectSlug,
  digest,
  snapshot,
  error,
  scheme,
  onTheme,
}: Options): RendererPresentation {
  const machine = useMemo(() => createPresentationMachine(), []);
  const [state, setState] = useState<PresentationState>(() => machine.initialState());

  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const onThemeRef = useRef(onTheme);
  const agentStateForSlug = useAgentState(activeProjectSlug);
  const agentStateRef = useRef(agentStateForSlug);
  const dispatchRef = useRef<(event: PresentationEvent) => void>(() => {});
  const lastHydratedKeyRef = useRef<string | null>(null);
  const lastFilesRef = useRef<readonly ProjectFile[] | null>(null);

  // Per-slot shells, keyed by slot generation. RendererIframe writes via
  // its `onShellReady` callback; reads pluck the active shell via
  // state.cur.generation.
  const [shells, setShells] = useState<ReadonlyMap<number, RendererShellApi>>(
    () => new Map(),
  );
  const curGeneration = state.cur?.generation ?? null;
  const curSlug = state.cur?.slug ?? null;
  const curShell = curGeneration !== null
    ? shells.get(curGeneration) ?? null
    : null;

  useEffect(() => {
    actionsRef.current = actions;
    onThemeRef.current = onTheme;
    agentStateRef.current = agentStateForSlug;
  });

  const runCommand = useCallback((command: PresentationCommand) => {
    switch (command.type) {
      case "emitTheme":
        onThemeRef.current(command.theme);
        return;
    }
  }, []);

  const dispatch = useCallback(
    (event: PresentationEvent) => {
      const result = machine.transition(stateRef.current, event);
      if (result.state !== stateRef.current) {
        stateRef.current = result.state;
        setState(result.state);
      }
      for (const command of result.commands) runCommand(command);
    },
    [machine, runCommand],
  );

  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  // Slug intent → presentation request.
  useEffect(() => {
    dispatch({ type: "REQUEST_SLUG", slug: activeProjectSlug });
  }, [activeProjectSlug, dispatch]);

  // Digest + snapshot ready (server-driven asset metadata + workspace files).
  useEffect(() => {
    if (!digest || !snapshot || snapshot.slug !== activeProjectSlug) return;
    dispatch({
      type: "DIGEST_READY",
      slug: snapshot.slug,
      digest,
      snapshot,
    });
  }, [activeProjectSlug, digest, snapshot, dispatch]);

  // Snapshot-only updates while mounted — files/baseUrl change, no remount.
  useEffect(() => {
    if (!snapshot || snapshot.slug !== activeProjectSlug) return;
    dispatch({
      type: "SNAPSHOT_UPDATED",
      slug: snapshot.slug,
      snapshot,
    });
  }, [activeProjectSlug, snapshot, dispatch]);

  // Server-side error reporting (404, build failure, etc.).
  useEffect(() => {
    if (!error) return;
    dispatch({ type: "ERROR_REPORTED", message: error });
  }, [error, dispatch]);

  // Hydrate the cur shell once it's available, before MOUNTED. Re-hydrate on
  // generation change so each slot receives its own initial state.
  useEffect(() => {
    if (!curShell || curGeneration === null || curSlug === null) return;
    if (!snapshot || snapshot.slug !== curSlug) return;
    const key = `${curGeneration}:${curSlug}`;
    if (lastHydratedKeyRef.current === key) return;
    lastHydratedKeyRef.current = key;
    curShell.hydrate(
      toHydratePayload(
        snapshot.slug,
        snapshot.baseUrl,
        agentStateRef.current,
        snapshot.files,
      ),
    );
  }, [curShell, curGeneration, curSlug, snapshot]);

  // Push scheme to the cur shell. Ignore prev — it's fading out anyway.
  useEffect(() => {
    if (!curShell) return;
    curShell.pushScheme(scheme);
  }, [curShell, scheme]);

  // Push file changes to cur shell when snapshot.files ref changes.
  useEffect(() => {
    if (!curShell || curSlug === null || !snapshot) return;
    if (snapshot.slug !== curSlug) return;
    if (state.phase !== "fading-in" && state.phase !== "showing") return;
    if (lastFilesRef.current === snapshot.files) return;
    lastFilesRef.current = snapshot.files;
    curShell.pushFiles(snapshot.files);
  }, [curShell, curSlug, snapshot, state.phase]);

  // Subscribe to AgentEvent fan-out and forward to the cur iframe-side reducer.
  // Iframe buffers pre-MOUNTED events, so we wire as soon as the shell exists.
  useEffect(() => {
    if (!curShell || curSlug === null) return;
    return subscribeAgentEvents((eventSlug, event) => {
      if (eventSlug !== curSlug) return;
      curShell.applyEvent(event);
    });
  }, [curShell, curSlug]);

  // Per-slot shell setter. Map identity changes on every write to keep React
  // state semantics; deletes drop the entry.
  const setShellForSlot = useCallback(
    (generation: number, shell: RendererShellApi | null) => {
      setShells((prev) => {
        const existing = prev.get(generation) ?? null;
        if (existing === shell) return prev;
        const next = new Map(prev);
        if (shell === null) next.delete(generation);
        else next.set(generation, shell);
        return next;
      });
    },
    [],
  );

  // Build host handlers per slot. Generation is captured so MOUNTED ack and
  // friends carry the right tag — stale handlers (from torn-down slots)
  // hit the state-machine generation guard.
  const makeHostHandlers = useCallback(
    (generation: number): RendererHostApi => ({
      mounted({ theme }) {
        dispatchRef.current({ type: "MOUNTED", generation, theme });
      },
      send(text) {
        void actionsRef.current.send(text);
      },
      fill(text) {
        void actionsRef.current.fill(text);
      },
      onTheme(theme) {
        dispatchRef.current({ type: "THEME_PUSHED", generation, theme });
      },
      onError(message) {
        dispatchRef.current({ type: "MOUNT_FAILED", generation, message });
      },
    }),
    [],
  );

  const rendered = selectSlots(state);
  const slots = rendered.map<PresentationSlot>((slot) => ({
    ...slot,
    className: slotWrapperClassName(slot.visualState),
    hostHandlers: makeHostHandlers(slot.generation),
    onShellReady: (shell) => setShellForSlot(slot.generation, shell),
    onTransitionEnd: (event) => {
      if (event.propertyName !== "opacity") return;
      if (slot.visualState === "fading-in") {
        dispatchRef.current({
          type: "FADE_IN_DONE",
          generation: slot.generation,
        });
      } else if (slot.visualState === "fading-out") {
        dispatchRef.current({
          type: "FADE_OUT_DONE",
          generation: slot.generation,
        });
      }
    },
  }));

  return {
    slots,
    visibleError: state.visibleError,
  };
}
