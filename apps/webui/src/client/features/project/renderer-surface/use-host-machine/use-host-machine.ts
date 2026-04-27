/* oxlint-disable react-hooks-js/set-state-in-effect -- This hook is an explicit renderer host state machine driven by external project/output events. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type RendererActions,
  type RendererBundle,
  type RendererSnapshot,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import {
  importRendererModule,
  type RendererModule,
} from "@/client/entities/renderer/bundle/index.js";
import type { RendererLayerHandle } from "../RendererLayer.js";
import { evaluateTheme, themeIdentity } from "./theme-identity.js";
import {
  classForStatus,
  errorMessage,
  FADE_IN_MS,
  FADE_OUT_MS,
  THEME_TRANSITION_MS,
  type HostStatus,
} from "./transitions.js";

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
  onImportError: (message: string) => void;
  onTheme: (theme: RendererTheme | null) => void;
}

interface RendererHostMachine {
  layerClassName: string;
  visibleError: string | null;
}

export function useRendererHostMachine({
  actions,
  activeProjectSlug,
  bundle,
  snapshot,
  error,
  layerHandle,
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
  const themeIdentityRef = useRef<string>("null");
  const [status, setStatusState] = useState<HostStatus>("stable");
  const [visibleError, setVisibleError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setStatus = useCallback((next: HostStatus) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const emitTheme = useCallback((theme: RendererTheme | null) => {
    const nextIdentity = themeIdentity(theme);
    if (themeIdentityRef.current === nextIdentity) return;
    themeIdentityRef.current = nextIdentity;
    onTheme(theme);
  }, [onTheme]);

  const mountPrepared = useCallback((prepared: PreparedRenderer) => {
    if (!layerHandle) return;
    setVisibleError(null);
    layerHandle.clear();
    layerHandle.setCss(prepared.bundle.css);
    try {
      layerHandle.renderModule(prepared.module, actions, prepared.snapshot);
    } catch (mountError: unknown) {
      const message = errorMessage(mountError);
      clearTimer();
      preparedRef.current = null;
      mountedBundleRef.current = null;
      mountedModuleRef.current = null;
      setVisibleError(message);
      setStatus("showing-error");
      onImportError(message);
      return;
    }
    mountedBundleRef.current = prepared.bundle;
    mountedModuleRef.current = prepared.module;
    visibleSlugRef.current = prepared.slug;
    setStatus("fading-in");
    timerRef.current = setTimeout(() => {
      setStatus("stable");
      timerRef.current = null;
    }, FADE_IN_MS);
  }, [actions, clearTimer, layerHandle, onImportError, setStatus]);

  const applyPreparedTheme = useCallback((prepared: PreparedRenderer) => {
    emitTheme(prepared.theme);
    setStatus("applying-theme");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus("mounting");
      mountPrepared(prepared);
    }, THEME_TRANSITION_MS);
  }, [emitTheme, mountPrepared, setStatus]);

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
      emitTheme(null);
      setVisibleError(null);
      setStatus("stable");
      return;
    }

    if (visibleSlugRef.current !== null && visibleSlugRef.current !== activeProjectSlug) {
      startProjectTransition();
    }
  }, [activeProjectSlug, clearTimer, emitTheme, layerHandle, setStatus, startProjectTransition]);

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
    layerHandle?.updateSnapshot(snapshot);
  }, [layerHandle, snapshot]);

  useEffect(() => {
    const mod = mountedModuleRef.current;
    if (!mod || !snapshot || snapshot.slug !== visibleSlugRef.current) return;
    if (status !== "stable") return;
    emitTheme(evaluateTheme(mod, snapshot));
  }, [emitTheme, snapshot, status]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    layerClassName: classForStatus(status),
    visibleError,
  };
}
