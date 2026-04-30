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
import { ShadowShell, type ShadowShellHandle } from "./ShadowShell.js";
import { useRendererSurfaceMachine } from "./use-surface-machine/index.js";

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh, refreshState } = useRendererOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const [shellHandle, setShellHandle] = useState<ShadowShellHandle | null>(null);
  const stateRef = useRef(state);

  const onTheme = useCallback(
    (theme: RendererTheme | null) => rendererViewDispatch({ type: "SET_THEME", theme }),
    [rendererViewDispatch],
  );

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

  const { shellClassName, visibleError } = useRendererSurfaceMachine({
    actions,
    activeProjectSlug: project.activeProjectSlug,
    bundle: rendererView.bundle,
    snapshot: rendererView.snapshot,
    error: rendererView.error,
    shellHandle,
    onImportError: handleRendererError,
    onTheme,
  });

  return (
    <div data-renderer-surface className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div className="relative h-full min-h-full">
          <ShadowShell
            register={setShellHandle}
            className={shellClassName}
          />
        </div>
        {visibleError ? (
          <div className="p-4 text-sm text-danger font-mono whitespace-pre-wrap">
            <p>Renderer error:</p>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{visibleError}</pre>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
