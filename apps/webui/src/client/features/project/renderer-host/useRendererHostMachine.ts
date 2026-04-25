/* eslint-disable react-hooks/set-state-in-effect -- This hook is an explicit renderer host state machine driven by external project/output events. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  validateTheme,
  type RendererActions,
  type RendererBundle,
  type RendererSnapshot,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import type { RendererLayerHandle } from "./RendererLayer.js";
import type { RendererSnapshotStore } from "./useRendererSnapshots.js";
import {
  importRendererModule,
  installRendererRuntime,
  type RendererModule,
} from "./rendererRuntime.js";

type HostStatus =
  | "stable"
  | "fading-out"
  | "waiting-for-import"
  | "applying-theme"
  | "mounting"
  | "fading-in"
  | "showing-error";

/*
 * Project switch statechart:
 * stable -> fading-out -> waiting-for-import -> applying-theme -> mounting -> fading-in -> stable
 *
 * Import may finish early, but the pending theme is not applied until fade-out
 * is done. The next renderer is mounted only after the theme transition window.
 */
interface PreparedRenderer {
  slug: string;
  module: RendererModule;
  snapshot: RendererSnapshot;
  bundle: RendererBundle;
  theme: RendererTheme | null;
}

interface RendererHostMachineOptions {
  actions: RendererActions;
  activeProjectSlug: string | null;
  bundle: RendererBundle | null;
  snapshot: RendererSnapshot | null;
  error: string | null;
  layerHandle: RendererLayerHandle | null;
  snapshots: RendererSnapshotStore;
  onImportError: (message: string) => void;
  onTheme: (theme: RendererTheme | null) => void;
}

interface RendererHostMachine {
  layerClassName: string;
  visibleError: string | null;
}

const FADE_OUT_MS = 300;
const THEME_TRANSITION_MS = 300;
const FADE_IN_MS = 180;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function evaluateTheme(
  mod: RendererModule,
  snapshot: RendererSnapshot,
): RendererTheme | null {
  try {
    return validateTheme(mod.theme?.(snapshot) ?? null);
  } catch (error) {
    console.warn("[renderer.theme] theme function threw", error);
    return null;
  }
}

function classForStatus(status: HostStatus): string {
  const base = "relative z-10 h-full min-h-full";
  switch (status) {
    case "fading-out":
      return `${base} opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0`;
    case "waiting-for-import":
    case "applying-theme":
    case "mounting":
      return `${base} opacity-0 transition-none`;
    case "fading-in":
    case "showing-error":
      return `${base} opacity-100 transition-opacity duration-200 ease-out motion-reduce:duration-0`;
    case "stable":
      return `${base} opacity-100 transition-none`;
  }
}

export function useRendererHostMachine({
  actions,
  activeProjectSlug,
  bundle,
  snapshot,
  error,
  layerHandle,
  snapshots,
  onImportError,
  onTheme,
}: RendererHostMachineOptions): RendererHostMachine {
  const visibleSlugRef = useRef<string | null>(snapshot?.slug ?? null);
  const statusRef = useRef<HostStatus>("stable");
  const generationRef = useRef(0);
  const preparedRef = useRef<PreparedRenderer | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedBundleRef = useRef<RendererBundle | null>(null);
  const mountedModuleRef = useRef<RendererModule | null>(null);
  const [status, setStatusState] = useState<HostStatus>("stable");
  const [visibleError, setVisibleError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setStatus = useCallback((next: HostStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const mountPrepared = useCallback((prepared: PreparedRenderer) => {
    if (!layerHandle) return;
    setVisibleError(null);
    layerHandle.clear();
    snapshots.setLayerSnapshot(0, prepared.snapshot);
    layerHandle.setCss(prepared.bundle.css);
    layerHandle.renderModule(prepared.module, actions, snapshots);
    mountedBundleRef.current = prepared.bundle;
    mountedModuleRef.current = prepared.module;
    visibleSlugRef.current = prepared.slug;
    setStatus("fading-in");
    timerRef.current = setTimeout(() => {
      setStatus("stable");
      timerRef.current = null;
    }, FADE_IN_MS);
  }, [actions, layerHandle, setStatus, snapshots]);

  const applyPreparedTheme = useCallback((prepared: PreparedRenderer) => {
    onTheme(prepared.theme);
    setStatus("applying-theme");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus("mounting");
      mountPrepared(prepared);
    }, THEME_TRANSITION_MS);
  }, [mountPrepared, onTheme, setStatus]);

  const finishFadeOut = useCallback((generation: number) => {
    if (generationRef.current !== generation) return;
    timerRef.current = null;

    if (error) {
      layerHandle?.clear();
      mountedBundleRef.current = null;
      mountedModuleRef.current = null;
      visibleSlugRef.current = activeProjectSlug;
      setVisibleError(error);
      setStatus("showing-error");
      return;
    }

    const prepared = preparedRef.current;
    if (prepared) {
      applyPreparedTheme(prepared);
    } else {
      layerHandle?.clear();
      setStatus("waiting-for-import");
    }
  }, [activeProjectSlug, applyPreparedTheme, error, layerHandle, setStatus]);

  const startProjectTransition = useCallback(() => {
    clearTimer();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    preparedRef.current = null;
    setVisibleError(null);
    setStatus("fading-out");
    timerRef.current = setTimeout(() => finishFadeOut(generation), FADE_OUT_MS);
  }, [clearTimer, finishFadeOut, setStatus]);

  useLayoutEffect(() => {
    if (visibleSlugRef.current === null && snapshot?.slug) {
      visibleSlugRef.current = snapshot.slug;
    }
  }, [snapshot?.slug]);

  useEffect(() => {
    if (!activeProjectSlug) {
      clearTimer();
      generationRef.current += 1;
      preparedRef.current = null;
      visibleSlugRef.current = null;
      mountedBundleRef.current = null;
      mountedModuleRef.current = null;
      layerHandle?.clear();
      onTheme(null);
      setVisibleError(null);
      setStatus("stable");
      return;
    }

    if (visibleSlugRef.current !== null && visibleSlugRef.current !== activeProjectSlug) {
      startProjectTransition();
    }
  }, [activeProjectSlug, clearTimer, layerHandle, onTheme, setStatus, startProjectTransition]);

  useEffect(() => {
    if (!error) return;
    if (statusRef.current === "fading-out") return;
    clearTimer();
    generationRef.current += 1;
    preparedRef.current = null;
    layerHandle?.clear();
    mountedBundleRef.current = null;
    mountedModuleRef.current = null;
    visibleSlugRef.current = activeProjectSlug;
    setVisibleError(error);
    setStatus("showing-error");
  }, [activeProjectSlug, clearTimer, error, layerHandle, setStatus]);

  useEffect(() => {
    if (!bundle || !snapshot || snapshot.slug !== activeProjectSlug) return;
    if (mountedBundleRef.current === bundle && visibleSlugRef.current === snapshot.slug) {
      return;
    }

    const generation = generationRef.current;
    installRendererRuntime();

    void importRendererModule(bundle.js)
      .then((mod) => {
        if (generationRef.current !== generation) return;
        if (snapshot.slug !== activeProjectSlug) return;

        const prepared: PreparedRenderer = {
          slug: snapshot.slug,
          module: mod,
          snapshot,
          bundle,
          theme: evaluateTheme(mod, snapshot),
        };

        const currentStatus = statusRef.current;
        const isSameVisibleSlug = visibleSlugRef.current === snapshot.slug;
        if (currentStatus === "stable" && isSameVisibleSlug) {
          preparedRef.current = prepared;
          applyPreparedTheme(prepared);
          return;
        }

        preparedRef.current = prepared;
        if (currentStatus === "waiting-for-import") {
          applyPreparedTheme(prepared);
        }
      })
      .catch((importError: unknown) => {
        if (generationRef.current !== generation) return;
        onImportError(errorMessage(importError));
      });
  }, [
    activeProjectSlug,
    applyPreparedTheme,
    bundle,
    onImportError,
    snapshot,
  ]);

  useEffect(() => {
    const mod = mountedModuleRef.current;
    if (!mod || !snapshot || snapshot.slug !== visibleSlugRef.current) return;
    snapshots.setLayerSnapshot(0, snapshot);
    if (statusRef.current === "stable") {
      onTheme(evaluateTheme(mod, snapshot));
    }
  }, [onTheme, snapshot, snapshots]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    layerClassName: classForStatus(status),
    visibleError,
  };
}
