import { useCallback, useEffect, useMemo } from "react";
import { useAgentStream } from "@/client/creative-agent/index.js";
import {
  useRendererViewState,
  useRendererViewDispatch,
} from "./RendererViewContext.js";
import { useRendererOutput } from "./useRendererOutput.js";
import type {
  RendererAction,
  RendererActions,
  RendererTheme,
} from "./types.js";
import { RendererIframe } from "./RendererIframe.js";
import { useRendererPresentation } from "./useRendererPresentation.js";

const PROJECT_FILES_CHANGED = "agentchan:project-files-changed";

interface RenderedViewProps {
  slug: string | null;
  scheme: "light" | "dark";
  onRendererAction: (action: RendererAction) => void;
}

export function RenderedView({
  slug,
  scheme,
  onRendererAction,
}: RenderedViewProps) {
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const state = useAgentStream(slug);
  const { refresh } = useRendererOutput(slug);

  const onTheme = useCallback(
    (theme: RendererTheme | null) =>
      rendererViewDispatch({ type: "SET_THEME", theme }),
    [rendererViewDispatch],
  );

  const actions: RendererActions = useMemo(
    () => ({
      send(text) {
        onRendererAction({ type: "send", text });
      },
      fill(text) {
        onRendererAction({ type: "fill", text });
      },
    }),
    [onRendererAction],
  );

  useEffect(() => {
    void refresh();
  }, [slug, refresh]);

  useEffect(() => {
    const handleFilesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (detail?.slug === slug) {
        void refresh();
      }
    };
    window.addEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
    return () => window.removeEventListener(PROJECT_FILES_CHANGED, handleFilesChanged);
  }, [slug, refresh]);

  useEffect(() => {
    if (!state.isStreaming && slug) {
      void refresh();
    }
  }, [state.isStreaming, slug, refresh]);

  const presentation = useRendererPresentation({
    actions,
    activeProjectSlug: slug,
    digest: rendererView.digest,
    snapshot: rendererView.snapshot,
    error: rendererView.error,
    scheme,
    onTheme,
  });

  const error = presentation.visibleError;

  return (
    <div data-renderer-surface className="relative flex-1 flex flex-col min-h-0">
      <div className="relative flex-1">
        {presentation.slots.map((slot) => (
          <div
            key={slot.key}
            className={slot.className}
            onTransitionEnd={slot.onTransitionEnd}
          >
            <RendererIframe
              slug={slot.slug}
              digest={slot.digest}
              scheme={scheme}
              hostHandlers={slot.hostHandlers}
              onShellReady={slot.onShellReady}
            />
          </div>
        ))}
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
