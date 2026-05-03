/* oxlint-disable react-hooks-js/set-state-in-effect -- This adapter dispatches presentation events from external project/output state. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  validateTheme,
  type RendererActions,
  type RendererBundle,
  type RendererSnapshot,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import type { RendererLayerHandle } from "./RendererLayer.js";
import {
  importRendererModule,
  type RendererModule,
} from "./rendererRuntime.js";
import {
  createPresentationMachine,
  layerClassName,
  type PresentationCommand,
  type PresentationEvent,
  type PresentationState,
  type TimerKind,
} from "./presentationMachine.js";

const FADE_OUT_MS = 300;
const THEME_TRANSITION_MS = 300;
const FADE_IN_MS = 180;

const TIMER_DONE_EVENT: Record<
  TimerKind,
  "FADE_OUT_DONE" | "THEME_WINDOW_DONE" | "FADE_IN_DONE"
> = {
  "fade-out": "FADE_OUT_DONE",
  "theme-window": "THEME_WINDOW_DONE",
  "fade-in": "FADE_IN_DONE",
};

interface Options {
  actions: RendererActions;
  activeProjectSlug: string | null;
  bundle: RendererBundle | null;
  snapshot: RendererSnapshot | null;
  error: string | null;
  layerHandle: RendererLayerHandle | null;
  onTheme: (theme: RendererTheme | null) => void;
}

interface RendererPresentation {
  layerClassName: string;
  visibleError: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function evaluateTheme(
  mod: RendererModule,
  snapshot: RendererSnapshot,
): RendererTheme | null {
  try {
    return validateTheme(mod.renderer.theme?.(snapshot) ?? null);
  } catch (error) {
    console.warn("[renderer.theme] theme function threw", error);
    return null;
  }
}

export function useRendererPresentation({
  actions,
  activeProjectSlug,
  bundle,
  snapshot,
  error,
  layerHandle,
  onTheme,
}: Options): RendererPresentation {
  // Stable per-mount machine instance; closure captures the timer config.
  const machine = useMemo(
    () =>
      createPresentationMachine({
        fadeOutMs: FADE_OUT_MS,
        themeWindowMs: THEME_TRANSITION_MS,
        fadeInMs: FADE_IN_MS,
      }),
    [],
  );

  const [state, setState] = useState<PresentationState>(() => machine.initialState());

  const stateRef = useRef(state);
  const layerHandleRef = useRef(layerHandle);
  const actionsRef = useRef(actions);
  const onThemeRef = useRef(onTheme);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Async command runners (import .then, setTimeout) need to dispatch back
  // into the latest reducer; ref-indirection lets the closure see the
  // currently-installed dispatch.
  const dispatchRef = useRef<(event: PresentationEvent) => void>(() => {});

  useEffect(() => {
    layerHandleRef.current = layerHandle;
    actionsRef.current = actions;
    onThemeRef.current = onTheme;
  });

  const runCommand = useCallback((command: PresentationCommand) => {
    const dispatch = dispatchRef.current;
    switch (command.type) {
      case "import": {
        const cmd = command;
        void importRendererModule(cmd.bundle.js)
          .then((mod) => {
            const theme = evaluateTheme(mod, cmd.snapshot);
            dispatch({
              type: "IMPORT_OK",
              generation: cmd.generation,
              slug: cmd.slug,
              bundle: cmd.bundle,
              module: mod,
              snapshot: cmd.snapshot,
              theme,
            });
          })
          .catch((importError: unknown) => {
            dispatch({
              type: "IMPORT_FAIL",
              generation: cmd.generation,
              message: errorMessage(importError),
            });
          });
        return;
      }
      case "clearLayer": {
        layerHandleRef.current?.clear();
        return;
      }
      case "mount": {
        const handle = layerHandleRef.current;
        if (!handle) return;
        try {
          handle.clear();
          handle.setCss(command.prepared.bundle.css);
          handle.renderModule(
            command.prepared.module,
            actionsRef.current,
            command.prepared.snapshot,
          );
          dispatch({ type: "MOUNT_SUCCEEDED", generation: command.generation });
        } catch (mountError: unknown) {
          dispatch({
            type: "MOUNT_FAILED",
            generation: command.generation,
            message: errorMessage(mountError),
          });
        }
        return;
      }
      case "updateSnapshot": {
        layerHandleRef.current?.updateSnapshot(command.snapshot);
        return;
      }
      case "evaluateTheme": {
        const theme = evaluateTheme(command.module, command.snapshot);
        dispatch({
          type: "THEME_EVALUATED",
          generation: command.generation,
          theme,
        });
        return;
      }
      case "emitTheme": {
        onThemeRef.current(command.theme);
        return;
      }
      case "scheduleTimer": {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        const { timer, generation, durationMs } = command;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          dispatch({ type: TIMER_DONE_EVENT[timer], generation });
        }, durationMs);
        return;
      }
      case "cancelTimer": {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
    }
  }, []);

  const dispatch = useCallback(
    (event: PresentationEvent): void => {
      const result = machine.transition(stateRef.current, event);
      if (result.state !== stateRef.current) {
        stateRef.current = result.state;
        setState(result.state);
      }
      for (const command of result.commands) {
        runCommand(command);
      }
    },
    [machine, runCommand],
  );

  // Install the latest dispatch into the ref so async/timer callbacks
  // synchronously dispatched from runCommand reach the current reducer.
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  useEffect(() => {
    dispatch({ type: "REQUEST_SLUG", slug: activeProjectSlug });
  }, [activeProjectSlug, dispatch]);

  useEffect(() => {
    if (!bundle || !snapshot || snapshot.slug !== activeProjectSlug) return;
    dispatch({ type: "BUNDLE_READY", slug: snapshot.slug, bundle, snapshot });
  }, [activeProjectSlug, bundle, snapshot, dispatch]);

  useEffect(() => {
    if (!error) return;
    dispatch({ type: "ERROR_REPORTED", message: error });
  }, [error, dispatch]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return {
    layerClassName: layerClassName(state.phase),
    visibleError: state.visibleError,
  };
}
