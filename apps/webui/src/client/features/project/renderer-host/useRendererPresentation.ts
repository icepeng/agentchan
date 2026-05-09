/* oxlint-disable react-hooks-js/set-state-in-effect -- Adapter dispatches presentation events from external project/output state. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeAgentEvents,
  useAgentState,
  type AgentState,
} from "@/client/entities/agent-state/index.js";
import {
  toRendererAgentState,
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
  iframeWrapperClassName,
  type PresentationCommand,
  type PresentationEvent,
  type PresentationState,
} from "./presentationMachine.js";

interface Options {
  actions: RendererActions;
  activeProjectSlug: string | null;
  digest: string | null;
  snapshot: RendererSnapshot | null;
  error: string | null;
  scheme: "light" | "dark";
  shell: RendererShellApi | null;
  onTheme: (theme: RendererTheme | null) => void;
}

interface RendererPresentation {
  iframeWrapperClassName: string;
  visibleError: string | null;
  hostHandlers: RendererHostApi;
  /** Slug + digest to feed into RendererIframe; null when not ready. */
  active: { slug: string; digest: string } | null;
}

function toHydratePayload(
  slug: string,
  baseUrl: string,
  state: AgentState,
  files: readonly ProjectFile[],
): HydratePayload {
  const r = toRendererAgentState(state);
  return {
    slug,
    baseUrl,
    state: r,
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
  shell,
  onTheme,
}: Options): RendererPresentation {
  const machine = useMemo(() => createPresentationMachine(), []);
  const [state, setState] = useState<PresentationState>(() => machine.initialState());

  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const onThemeRef = useRef(onTheme);
  const shellRef = useRef(shell);
  const agentStateForSlug = useAgentState(activeProjectSlug);
  const agentStateRef = useRef(agentStateForSlug);
  const snapshotRef = useRef(snapshot);
  const dispatchRef = useRef<(event: PresentationEvent) => void>(() => {});
  const lastHydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    actionsRef.current = actions;
    onThemeRef.current = onTheme;
    shellRef.current = shell;
    agentStateRef.current = agentStateForSlug;
    snapshotRef.current = snapshot;
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

  // Hydrate iframe once shell + snapshot are available, before MOUNTED.
  // Re-hydrate on slug or generation change so a project switch resets state.
  useEffect(() => {
    if (!shell || !snapshot || snapshot.slug !== activeProjectSlug) return;
    const key = `${state.generation}:${snapshot.slug}`;
    if (lastHydratedKeyRef.current === key) return;
    lastHydratedKeyRef.current = key;
    shell.hydrate(
      toHydratePayload(
        snapshot.slug,
        snapshot.baseUrl,
        agentStateRef.current,
        snapshot.files,
      ),
    );
  }, [shell, snapshot, activeProjectSlug, state.generation]);

  // Push scheme changes to the iframe.
  useEffect(() => {
    shell?.pushScheme(scheme);
  }, [shell, scheme]);

  // Push file changes (not state — events handle that) when snapshot.files
  // ref changes for the same mounted slug.
  const lastFilesRef = useRef<readonly ProjectFile[] | null>(null);
  useEffect(() => {
    if (!shell || !snapshot || snapshot.slug !== activeProjectSlug) return;
    if (state.phase !== "mounted") return;
    if (lastFilesRef.current === snapshot.files) return;
    lastFilesRef.current = snapshot.files;
    shell.pushFiles(snapshot.files);
  }, [shell, snapshot, activeProjectSlug, state.phase]);

  // Subscribe to AgentEvent fan-out and forward to the iframe-side reducer.
  useEffect(() => {
    if (!shell || !activeProjectSlug || state.phase !== "mounted") return;
    return subscribeAgentEvents((slug, event) => {
      if (slug !== activeProjectSlug) return;
      shell.applyEvent(event);
    });
  }, [shell, activeProjectSlug, state.phase]);

  // Stable handlers object — keeps the iframe component's effect deps lean.
  const hostHandlers = useMemo<RendererHostApi>(
    () => ({
      mounted({ theme }) {
        dispatchRef.current({
          type: "MOUNTED",
          generation: stateRef.current.generation,
          theme,
        });
      },
      send(text) {
        void actionsRef.current.send(text);
      },
      fill(text) {
        void actionsRef.current.fill(text);
      },
      onTheme(theme) {
        dispatchRef.current({
          type: "THEME_PUSHED",
          generation: stateRef.current.generation,
          theme,
        });
      },
      onError(message) {
        dispatchRef.current({
          type: "MOUNT_FAILED",
          generation: stateRef.current.generation,
          message,
        });
      },
    }),
    [],
  );

  return {
    iframeWrapperClassName: iframeWrapperClassName(state.phase),
    visibleError: state.visibleError,
    hostHandlers,
    active:
      state.requestedSlug && state.digest
        ? { slug: state.requestedSlug, digest: state.digest }
        : null,
  };
}
