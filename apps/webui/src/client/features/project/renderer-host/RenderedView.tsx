import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useViewState,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import {
  useRendererOutput,
  useRendererViewState,
  useRendererViewDispatch,
  useRendererActionDispatch,
  type RendererActions,
  type RendererTheme,
} from "@/client/entities/renderer/index.js";
import { useTheme } from "@/client/features/settings/index.js";
import type { RendererShellApi } from "@agentchan/renderer/host";
import { RendererIframe } from "./RendererIframe.js";
import { useRendererPresentation } from "./useRendererPresentation.js";

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

export function RenderedView() {
  const activeProjectSlug = selectActiveProjectSlug(useViewState());
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentState();
  const { refresh } = useRendererOutput();
  const actionDispatch = useRendererActionDispatch();
  const { resolved: scheme } = useTheme();
  const [shell, setShell] = useState<RendererShellApi | null>(null);

  const onTheme = useCallback(
    (theme: RendererTheme | null) =>
      rendererViewDispatch({ type: "SET_THEME", theme }),
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

  useEffect(() => {
    void refresh();
  }, [activeProjectSlug, refresh]);

  useEffect(() => {
    const handleFilesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (detail?.slug === activeProjectSlug) {
        void refresh();
      }
    };
    window.addEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
    return () => window.removeEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
  }, [activeProjectSlug, refresh]);

  useEffect(() => {
    if (!state.isStreaming && activeProjectSlug) {
      void refresh();
    }
  }, [state.isStreaming, activeProjectSlug, refresh]);

  const presentation = useRendererPresentation({
    actions,
    activeProjectSlug,
    digest: rendererView.digest,
    snapshot: rendererView.snapshot,
    error: rendererView.error,
    scheme,
    shell,
    onTheme,
  });

  const error = presentation.visibleError;
  const active = presentation.active;

  return (
    <div data-renderer-surface className="relative flex-1 flex flex-col min-h-0">
      <div className="relative flex-1">
        {active ? (
          <div className={presentation.iframeWrapperClassName}>
            <RendererIframe
              slug={active.slug}
              digest={active.digest}
              scheme={scheme}
              hostHandlers={presentation.hostHandlers}
              onShellReady={setShell}
            />
          </div>
        ) : null}
        {error ? (
          <div className="p-4 text-sm text-danger font-mono whitespace-pre-wrap">
            <p>Renderer error:</p>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{error}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
