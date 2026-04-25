import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import {
  useRendererOutput,
  useRendererViewState,
  useRendererViewDispatch,
  useRendererActionDispatch,
  type RendererActions,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { RendererLayer, type RendererLayerHandle } from "./RendererLayer.js";
import { useRendererHostMachine } from "./useRendererHostMachine.js";
import { useRendererSnapshots } from "./useRendererSnapshots.js";
import type { RendererLayerId } from "./rendererRuntime.js";

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh, refreshState } = useRendererOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const [layerHandle, setLayerHandle] = useState<RendererLayerHandle | null>(null);
  const stateRef = useRef(state);

  // Stable identity here is semantic: child ShadowRoot effects depend on it.
  const registerLayer = useCallback((layer: RendererLayerId, handle: RendererLayerHandle | null) => {
    if (layer === 0) setLayerHandle(handle);
  }, []);

  const onTheme = useCallback(
    (theme: RendererTheme | null) => rendererViewDispatch({ type: "SET_THEME", theme }),
    [rendererViewDispatch],
  );

  const snapshots = useRendererSnapshots({
    snapshot: rendererView.snapshot,
  });

  const actions: RendererActions = useMemo(
    () => ({
      send(text) {
        actionDispatch({ type: "SET_ACTION", action: { type: "send", text } });
      },
      fill(text) {
        actionDispatch({ type: "SET_ACTION", action: { type: "fill", text } });
      },
    }),
    [actionDispatch],
  );
  const handleRendererError = useCallback(
    (error: string) => rendererViewDispatch({ type: "SET_ERROR", error }),
    [rendererViewDispatch],
  );

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    void refresh();
  }, [project.activeProjectSlug, refresh]);

  useEffect(() => {
    const handleFilesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (detail?.slug === project.activeProjectSlug) {
        void refresh();
      }
    };
    window.addEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
    return () => window.removeEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
  }, [project.activeProjectSlug, refresh]);

  useEffect(() => {
    if (!state.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [state.isStreaming, project.activeProjectSlug, refresh]);

  useEffect(() => {
    if (!state.isStreaming) return;
    let raf = 0;
    let lastState = stateRef.current;
    refreshState();
    const tick = () => {
      if (stateRef.current !== lastState) {
        lastState = stateRef.current;
        refreshState();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isStreaming, refreshState]);

  const host = useRendererHostMachine({
    actions,
    activeProjectSlug: project.activeProjectSlug,
    bundle: rendererView.bundle,
    snapshot: rendererView.snapshot,
    error: rendererView.error,
    layerHandle,
    snapshots,
    onImportError: handleRendererError,
    onTheme,
  });

  const error = host.visibleError;

  return (
    <div data-renderer-surface className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div className="relative h-full min-h-full">
          <RendererLayer
            layer={0}
            register={registerLayer}
            className={host.layerClassName}
          />
        </div>
        {error ? (
          <div className="p-4 text-sm text-danger font-mono whitespace-pre-wrap">
            <p>Renderer error:</p>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{error}</pre>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
