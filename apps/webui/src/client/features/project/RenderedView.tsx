import { useEffect, type ComponentType, type ReactNode } from "react";
import {
  projectBaseUrl,
  useProjectSelectionState,
  useWorkspaceFiles,
} from "@/client/entities/project/index.js";
import {
  EMPTY_AGENT_STATE,
  useAgentState,
} from "@/client/entities/agent-state/index.js";
import {
  useRendererModule,
  useRendererActionDispatch,
  useRendererViewDispatch,
  validateTheme,
  resolveRawTheme,
  type RenderContext,
  type RendererActions,
  type RendererProps,
} from "@/client/entities/renderer/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { RendererErrorBoundary } from "./RendererErrorBoundary.js";
import { RendererShadowHost } from "./RendererShadowHost.js";

export function RenderedView() {
  const project = useProjectSelectionState();
  const module = useRendererModule(project.activeProjectSlug);
  const { t } = useI18n();

  if (!project.activeProjectSlug) return <RendererFrame />;

  switch (module.kind) {
    case "idle":
    case "loading":
      return (
        <RendererFrame>
          <RendererStatus message={t("renderer.loading")} />
        </RendererFrame>
      );
    case "missing":
      return (
        <RendererFrame>
          <RendererStatus message={t("renderer.notFound")} />
        </RendererFrame>
      );
    case "error":
      return (
        <RendererFrame>
          <RendererErrorView error={module.error} />
        </RendererFrame>
      );
    case "component":
      // Key on slug + js length so editor saves that produce a new compile
      // reset the boundary — otherwise a fixed renderer would stay stuck
      // on the last error screen.
      return (
        <RendererErrorBoundary
          key={`${module.slug}:${module.js.length}`}
          fallback={(err) => (
            <RendererFrame>
              <RendererErrorView error={err} />
            </RendererFrame>
          )}
        >
          <ComponentRenderedView
            slug={module.slug}
            Component={module.Component}
            rawTheme={module.rawTheme}
          />
        </RendererErrorBoundary>
      );
  }
}

function RendererFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea className="flex-1">
        <div className="h-full min-h-full">{children}</div>
      </ScrollArea>
    </div>
  );
}

function RendererStatus({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-full items-center justify-center text-[14px] text-[color:var(--color-fg-3)]">
      {message}
    </div>
  );
}

function RendererErrorView({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[14px] font-semibold text-[color:var(--color-danger,#c33)]">
        {t("renderer.error.title")}
      </p>
      <pre className="max-w-[600px] overflow-x-auto whitespace-pre-wrap text-left text-[12px] text-[color:var(--color-fg-3)]">
        {error.message}
      </pre>
      <p className="text-[12px] text-[color:var(--color-fg-3)]">
        {t("renderer.error.hint")}
      </p>
    </div>
  );
}

interface ComponentRenderedViewProps {
  slug: string;
  Component: ComponentType<RendererProps>;
  rawTheme: unknown;
}

function ComponentRenderedView({ slug, Component, rawTheme }: ComponentRenderedViewProps) {
  const state = useAgentState();
  const { data: workspace } = useWorkspaceFiles(slug);
  const files = workspace?.files ?? [];
  const baseUrl = projectBaseUrl(slug);

  const rendererViewDispatch = useRendererViewDispatch();
  const rendererActionDispatch = useRendererActionDispatch();

  const actions: RendererActions = {
    send(text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      rendererActionDispatch({
        type: "SET_ACTION",
        action: { type: "send", text: trimmed },
      });
    },
    fill(text: string) {
      rendererActionDispatch({
        type: "SET_ACTION",
        action: { type: "fill", text: text.trim() },
      });
    },
    // setTheme override stays a stub — the contract is wired so renderers can
    // call it without blowing up. Host-side plumbing lands when a template
    // actually needs imperative theme changes.
    setTheme() {},
  };

  // Theme is recomputed when slug or rawTheme change, not on every AgentState
  // tick. Static themes pay nothing; function themes get an initial empty
  // state so they can still inspect files.
  useEffect(() => {
    const ctx: RenderContext = {
      files,
      baseUrl,
      state: EMPTY_AGENT_STATE,
    };
    const theme = validateTheme(resolveRawTheme(rawTheme, ctx));
    rendererViewDispatch({ type: "SET_THEME", theme });
    // files intentionally omitted — theme reacts to slug/rawTheme, not streams
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, rawTheme, baseUrl, rendererViewDispatch]);

  return (
    <RendererFrame>
      <RendererShadowHost>
        <Component
          state={state}
          files={files}
          slug={slug}
          baseUrl={baseUrl}
          actions={actions}
        />
      </RendererShadowHost>
    </RendererFrame>
  );
}
