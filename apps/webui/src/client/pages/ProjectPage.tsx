import { useState, useRef, useCallback, Suspense, lazy } from "react";
import { ChevronsLeft } from "lucide-react";
import { useProjectState } from "@/client/entities/project/index.js";
import { useUIState, useUIDispatch, EditModeToggle } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { RenderedView } from "@/client/features/project/index.js";
import { AgentPanel, BottomInput } from "@/client/features/chat/index.js";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle.js";

const EditModePanel = lazy(() =>
  import("@/client/features/editor/index.js").then((m) => ({
    default: m.EditModePanel,
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
  const project = useProjectState();
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef(0);

  const isEdit = ui.viewMode === "edit";

  const handlePanelResize = useCallback((delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const maxWidth = container.getBoundingClientRect().width * MAX_PANEL_RATIO;
    setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, dragStartRef.current - delta)));
  }, []);

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
            <EditModePanel />
          </Suspense>
        ) : (
          // Chat mode: Rendered View
          <div className={`flex-1 flex flex-col min-w-0 ${agentPanelOpen ? "" : "border-r border-edge/6"}`}>
            {project.activeProjectSlug ? (
              <RenderedView />
            ) : (
              <EmptyState
                onBrowseTemplates={() =>
                  uiDispatch({ type: "NAVIGATE", route: { page: "templates" } })
                }
              />
            )}
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
            className="flex-shrink-0 flex flex-col min-h-0 bg-base/40 hidden lg:flex"
          >
            <AgentPanel />
            {isEdit && <BottomInput variant="embedded" />}
          </div>
        ) : (
          <div className="hidden lg:flex flex-shrink-0 w-8 flex-col items-center border-l border-edge/6 bg-base/20">
            <EditModeToggle />
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

function EmptyState({ onBrowseTemplates }: { onBrowseTemplates: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center">
          <div className="w-5 h-5 rounded-lg bg-accent/20 animate-glow" />
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-fg mb-2">
          agent<span className="text-accent">chan</span>
        </h2>
        <p className="text-sm text-fg-3 mb-2 tracking-wide">
          {t("empty.subtitle")}
        </p>
        <p className="text-sm text-fg-2 mb-8 tracking-wide">
          {t("empty.noProjectTitle")}
        </p>
        <button
          type="button"
          onClick={onBrowseTemplates}
          className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm font-medium hover:bg-accent/15 hover:border-accent/30 active:scale-[0.98] transition-all duration-200"
        >
          {t("empty.browseTemplates")}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
