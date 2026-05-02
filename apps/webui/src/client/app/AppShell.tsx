import { Suspense, lazy, useEffect } from "react";
import { Menu } from "lucide-react";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import {
  useViewState,
  useViewDispatch,
  selectActiveProjectSlug,
  type View,
} from "@/client/entities/view/index.js";
import {
  useRendererViewState,
  resolveThemeVars,
} from "@/client/entities/renderer/index.js";
import { useTheme } from "@/client/features/settings/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { markSeen } from "@/client/shared/notifications.js";
import { Sidebar } from "./Sidebar.js";
import { ProjectPage } from "@/client/pages/ProjectPage.js";
import { AppSettingsPage } from "@/client/pages/AppSettingsPage.js";
import { OnboardingWizard } from "@/client/features/onboarding/index.js";
import { ProjectReadmeModal } from "@/client/features/project/index.js";

// Templates page is lazy-loaded to keep it out of the main bundle.
const TemplatesPage = lazy(() =>
  import("@/client/pages/TemplatesPage.js").then((m) => ({ default: m.TemplatesPage })),
);

function PageContent({ view, agentPanelOpen, onToggleAgentPanel }: {
  view: View;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
}) {
  switch (view.kind) {
    case "templates":
      return <TemplatesPage />;
    case "settings":
      return <AppSettingsPage />;
    case "project":
      return <ProjectPage agentPanelOpen={agentPanelOpen} onToggleAgentPanel={onToggleAgentPanel} />;
  }
}

export function AppShell() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const viewState = useViewState();
  const viewDispatch = useViewDispatch();
  const rendererView = useRendererViewState();
  const { resolved: userScheme } = useTheme();
  const { t } = useI18n();

  const view = viewState.view;
  const activeProjectSlug = selectActiveProjectSlug(viewState);

  // Ctrl+E / Cmd+E to toggle edit mode (project view only).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "e" && view.kind === "project") {
        e.preventDefault();
        viewDispatch({
          type: "SET_VIEW_MODE",
          mode: view.mode === "edit" ? "chat" : "edit",
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, viewDispatch]);

  // Clear tab title badge for the currently-viewed project.
  // Runs on: project switch, visibility change (user returns to tab).
  useEffect(() => {
    const sync = () => {
      if (!document.hidden) markSeen(activeProjectSlug);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [activeProjectSlug]);

  // Renderer-owned theme is active only on the project page in chat mode.
  // Edit mode / Settings / Templates stay neutral on the base Obsidian Teal palette.
  const themeActive =
    rendererView.theme !== null &&
    view.kind === "project" &&
    view.mode === "chat";

  const resolvedTheme =
    themeActive && rendererView.theme
      ? resolveThemeVars(rendererView.theme, userScheme)
      : null;

  const rootStyle = resolvedTheme?.vars;
  // data-theme는 prefersScheme가 명시된 경우에만 scope-local override.
  // 이렇게 하면 Settings/Templates에 들어갔을 때 사용자 원래 모드로 자동 복귀한다.
  const dataThemeOverride =
    resolvedTheme?.forceScheme ? resolvedTheme.effectiveScheme : undefined;

  return (
    <div
      className="flex h-full bg-void text-fg font-body transition-colors duration-300"
      style={rootStyle}
      data-theme={dataThemeOverride}
    >
      {/* Sidebar expand toggle — visible only when sidebar is collapsed */}
      <button
        onClick={() => uiDispatch({ type: "TOGGLE_SIDEBAR" })}
        className={`fixed top-3 left-3 z-50 p-2 rounded-lg bg-elevated border border-edge/6 hover:border-edge/12 transition-all duration-150 ${
          ui.sidebarOpen ? "hidden" : "block"
        }`}
        title={t("ui.sidebar.expand")}
        aria-label={t("ui.sidebar.expand")}
      >
        <Menu size={18} strokeWidth={2.5} className="text-fg-2" />
      </button>

      {/* Sidebar — fixed overlay on mobile, width-animated flex child on desktop.
          Sidebar itself owns w-72; this wrapper only animates the opening. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 transform lg:relative lg:z-auto lg:flex-shrink-0 lg:overflow-hidden transition-[transform,width] duration-300 ease-out ${
          ui.sidebarOpen
            ? "translate-x-0 lg:w-72"
            : "-translate-x-full lg:w-0"
        }`}
      >
        <Sidebar />
      </div>

      {/* Mobile backdrop when sidebar is open */}
      {ui.sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-void/80 backdrop-blur-sm lg:hidden"
          onClick={() => uiDispatch({ type: "TOGGLE_SIDEBAR" })}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Suspense fallback={<div className="flex-1" />}>
          <PageContent
            view={view}
            agentPanelOpen={ui.agentPanelOpen}
            onToggleAgentPanel={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
          />
        </Suspense>
      </div>

      <OnboardingWizard />
      <ProjectReadmeModal />
    </div>
  );
}
