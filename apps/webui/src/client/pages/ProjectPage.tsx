import { useState, useRef, Suspense, lazy } from "react";
import { ChevronsLeft } from "lucide-react";
import {
  useViewState,
  useViewDispatch,
  selectActiveProjectSlug,
} from "@/client/entities/view/index.js";
import {
  useSession,
  useSessionInputDispatch,
  type SessionInputIntent,
} from "@/client/session/index.js";
import { ErrorBoundary, useI18n } from "@/client/platform/index.js";
import { ProjectSurfaceErrorFallback } from "@/client/project/index.js";
import {
  RenderedView,
  type RendererAction,
} from "@/client/renderer-host/index.js";
import { useTheme } from "@/client/theme/index.js";
import {
  AgentPanel,
  AgentPanelErrorFallback,
  BottomInput,
} from "@/client/session/ui/index.js";
import { EditModeErrorFallback } from "@/client/project-editor/index.js";
import { EditModeToggle, ResizeHandle } from "@/client/design-system/index.js";

const ProjectEditor = lazy(() =>
  import("@/client/project-editor/index.js").then((m) => ({
    default: m.ProjectEditor,
  })),
);

const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_RATIO = 0.6;

interface ProjectPageProps {
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
}

export function ProjectPage({ agentPanelOpen, onToggleAgentPanel }: ProjectPageProps) {
  const viewState = useViewState();
  const viewDispatch = useViewDispatch();
  const { activeSessionId } = useSession();
  const dispatchSessionInput = useSessionInputDispatch();
  const { resolved: userScheme } = useTheme();
  const { t } = useI18n();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef(0);

  // ProjectPage is rendered by AppShell only when view.kind is "project", so
  // narrowing here is safe.
  if (viewState.view.kind !== "project") return null;
  const activeProjectSlug = selectActiveProjectSlug(viewState);
  const isEdit = viewState.view.mode === "edit";
  const switchToChatLabel = t("editMode.switchToChat");
  const switchToEditLabel = t("editMode.switchToEdit");

  const handleRendererAction = (action: RendererAction) => {
    const intent: SessionInputIntent =
      action.type === "send"
        ? { type: "submit", text: action.text }
        : { type: "fill", text: action.text };
    dispatchSessionInput(intent);
  };

  const handlePanelResize = (delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const maxWidth = container.getBoundingClientRect().width * MAX_PANEL_RATIO;
    setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, dragStartRef.current - delta)));
  };

  return (
    <>
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 35% at 50% 100%, rgba(45,212,191,0.025) 0%, transparent 70%)",
        }}
      />

      {/* Top area: split pane */}
      <div ref={containerRef} className="flex-1 flex min-h-0 relative z-10">
        {isEdit ? (
          // Edit mode: Tree + Editor | Chat Panel
          <Suspense fallback={<div className="flex-1" />}>
            <ErrorBoundary
              FallbackComponent={EditModeErrorFallback}
              resetKeys={[activeProjectSlug]}
              onError={(error, info) => {
                console.error("[ErrorBoundary] ProjectEditor", error, info.componentStack);
              }}
            >
              <ProjectEditor />
            </ErrorBoundary>
          </Suspense>
        ) : (
          // Chat mode: Rendered View
          <div className={`flex-1 flex flex-col min-w-0 transition-colors duration-300 ${agentPanelOpen ? "" : "border-r border-edge/6"}`}>
            <ErrorBoundary
              FallbackComponent={ProjectSurfaceErrorFallback}
              resetKeys={[activeProjectSlug]}
              onError={(error, info) => {
                console.error("[ErrorBoundary] RenderedView", error, info.componentStack);
              }}
            >
              <RenderedView
                slug={activeProjectSlug}
                scheme={userScheme}
                onRendererAction={handleRendererAction}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* Resize handle */}
        {agentPanelOpen && (
          <ResizeHandle
            onResizeStart={() => { dragStartRef.current = panelWidth; }}
            onResize={handlePanelResize}
          />
        )}

        {/* Right: Agent Panel (collapsible) */}
        {agentPanelOpen ? (
          <div
            style={{ width: panelWidth }}
            className="flex-shrink-0 flex flex-col min-h-0 bg-base/40 transition-colors duration-300 hidden lg:flex"
          >
            <ErrorBoundary
              FallbackComponent={AgentPanelErrorFallback}
              resetKeys={[activeProjectSlug, activeSessionId]}
              onError={(error, info) => {
                console.error("[ErrorBoundary] AgentPanel", error, info.componentStack);
              }}
            >
              <AgentPanel />
            </ErrorBoundary>
            {isEdit && <BottomInput variant="embedded" />}
          </div>
        ) : (
          <div className="hidden lg:flex flex-shrink-0 w-8 flex-col items-center border-l border-edge/6 bg-base/20 transition-colors duration-300">
            <EditModeToggle
              isEdit={isEdit}
              switchToChatLabel={switchToChatLabel}
              switchToEditLabel={switchToEditLabel}
              onToggle={() => viewDispatch({ type: "SET_VIEW_MODE", mode: isEdit ? "chat" : "edit" })}
            />
            <div className="flex-1" />
            <button
              onClick={onToggleAgentPanel}
              className="p-2 text-fg-3 hover:text-accent hover:bg-accent/8 transition-all duration-200 cursor-pointer group"
              title={t("empty.openAgentPanel")}
            >
              <ChevronsLeft size={14} strokeWidth={2} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom: Input (chat mode only) */}
      {!isEdit && <BottomInput variant="standalone" />}
    </>
  );
}
