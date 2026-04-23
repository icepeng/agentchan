import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useUIState, useUIDispatch } from "@/client/entities/ui/index.js";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useHostEventSubscription, type HostEvent } from "@/client/entities/agent-state/index.js";
import {
  resolveThemeVars,
  validateTheme,
  type RendererTheme,
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

function PageContent({ page, agentPanelOpen, onToggleAgentPanel }: {
  page: string;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
}) {
  switch (page) {
    case "templates":
      return <TemplatesPage />;
    case "settings":
      return <AppSettingsPage />;
    default:
      return <ProjectPage agentPanelOpen={agentPanelOpen} onToggleAgentPanel={onToggleAgentPanel} />;
  }
}

export function AppShell() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const project = useProjectSelectionState();
  const { resolved: userScheme } = useTheme();
  const { t } = useI18n();

  // Renderer-driven theme override. The iframe POSTs /actions/setTheme, the
  // server broadcasts `theme_changed` on the state SSE channel, and we track
  // the latest validated theme here — scoped to the current project page.
  // Renderer theme is keyed to the active project. Tracking `[slug, theme]`
  // together lets us drop stale palette when the user switches projects
  // without firing an effect.
  const [themeEntry, setThemeEntry] = useState<{
    slug: string | null;
    theme: RendererTheme | null;
  }>({ slug: null, theme: null });
  const handleHostEvent = useCallback((ev: HostEvent) => {
    if (ev.type !== "theme_changed") return;
    setThemeEntry((prev) => ({
      slug: prev.slug,
      theme: validateTheme(ev.theme),
    }));
  }, []);
  useHostEventSubscription(handleHostEvent);
  if (themeEntry.slug !== project.activeProjectSlug) {
    setThemeEntry({ slug: project.activeProjectSlug, theme: null });
  }
  const theme = themeEntry.theme;

  // Ctrl+E / Cmd+E to toggle edit mode (main page only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "e" && ui.currentPage.page === "main") {
        e.preventDefault();
        uiDispatch({ type: "SET_VIEW_MODE", mode: ui.viewMode === "edit" ? "chat" : "edit" });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ui.currentPage.page, ui.viewMode, uiDispatch]);

  // Clear tab title badge for the currently-viewed project.
  // Runs on: project switch, visibility change (user returns to tab).
  useEffect(() => {
    const sync = () => {
      if (!document.hidden) markSeen(project.activeProjectSlug);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [project.activeProjectSlug]);

  // Renderer-owned theme is active only on the project page in chat mode.
  // Edit mode / Settings / Templates stay neutral on the base Obsidian Teal palette.
  const themeActive =
    theme !== null &&
    ui.currentPage.page === "main" &&
    ui.viewMode === "chat";

  const resolvedTheme =
    themeActive && theme
      ? resolveThemeVars(theme, userScheme)
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
            page={ui.currentPage.page}
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
