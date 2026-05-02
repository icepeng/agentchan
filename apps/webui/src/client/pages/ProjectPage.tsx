import { useState, useRef, Suspense, lazy } from "react";
import { ChevronsLeft } from "lucide-react";
import { useViewState } from "@/client/entities/view/index.js";
import { EditModeToggle } from "@/client/entities/ui/index.js";
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
  const viewState = useViewState();
  const { t } = useI18n();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef(0);

  // ProjectPage is rendered by AppShell only when view.kind is "project", so
  // narrowing here is safe.
  if (viewState.view.kind !== "project") return null;
  const isEdit = viewState.view.mode === "edit";

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
            <EditModePanel />
          </Suspense>
        ) : (
          // Chat mode: Rendered View
          <div className={`flex-1 flex flex-col min-w-0 transition-colors duration-300 ${agentPanelOpen ? "" : "border-r border-edge/6"}`}>
            <RenderedView />
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
            <AgentPanel />
            {isEdit && <BottomInput variant="embedded" />}
          </div>
        ) : (
          <div className="hidden lg:flex flex-shrink-0 w-8 flex-col items-center border-l border-edge/6 bg-base/20 transition-colors duration-300">
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
