import { Suspense, lazy, useEffect, type CSSProperties, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  ErrorBoundary,
  markSeen,
  useI18n,
  useUIDispatch,
  useUIState,
} from "@/client/platform/index.js";
import {
  useViewState,
  useViewDispatch,
  selectActiveProjectSlug,
  type View,
} from "@/client/entities/view/index.js";
import {
  useProjectTheme,
  resolveThemeVars,
} from "@/client/renderer-host/index.js";
import { useTheme } from "@/client/theme/index.js";
import { Sidebar } from "./Sidebar.js";
import { ProjectPage } from "@/client/pages/ProjectPage.js";
import { AppSettingsPage } from "@/client/pages/AppSettingsPage.js";
import { OnboardingWizard } from "@/client/onboarding/index.js";
import {
  ProjectReadmeModal,
  useCreateProjectFromTemplate,
  useProject,
} from "@/client/project/index.js";
import { PageErrorFallback } from "./PageErrorFallback.js";

// Library page is lazy-loaded to keep it out of the main bundle.
const LibraryPage = lazy(() =>
  import("@/client/library/index.js").then((m) => ({ default: m.LibraryPage })),
);

function PageContent({
  view,
  agentPanelOpen,
  onToggleAgentPanel,
  settingsCanGoBack,
  onSettingsBack,
  libraryCanGoBack,
  onLibraryBack,
  createFromTemplate,
  trustDialog,
}: {
  view: View;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
  settingsCanGoBack: boolean;
  onSettingsBack: () => void;
  libraryCanGoBack: boolean;
  onLibraryBack: () => void;
  createFromTemplate: (projectName: string, templateSlug: string) => Promise<unknown>;
  trustDialog: ReactNode;
}) {
  switch (view.kind) {
    case "templates":
      return (
        <LibraryPage
          canGoBack={libraryCanGoBack}
          onBack={onLibraryBack}
          createFromTemplate={createFromTemplate}
          trustDialog={trustDialog}
        />
      );
    case "settings":
      return <AppSettingsPage canGoBack={settingsCanGoBack} onBack={onSettingsBack} />;
    case "project":
      return <ProjectPage agentPanelOpen={agentPanelOpen} onToggleAgentPanel={onToggleAgentPanel} />;
  }
}

export function AppShell() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const viewState = useViewState();
  const viewDispatch = useViewDispatch();
  const projectTheme = useProjectTheme();
  const { resolved: userScheme } = useTheme();
  const { createProject, projects, selectProject } = useProject();
  const { createFromTemplate, trustDialog } = useCreateProjectFromTemplate();
  const { t } = useI18n();

  const view = viewState.view;
  const activeProjectSlug = selectActiveProjectSlug(viewState);
  const openTemplates = () => viewDispatch({ type: "OPEN_TEMPLATES" });
  const settingsBackSlug = activeProjectSlug ?? projects[0]?.slug ?? null;
  const handleSettingsBack = () => {
    if (settingsBackSlug) void selectProject(settingsBackSlug);
  };

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
    projectTheme !== null &&
    view.kind === "project" &&
    view.mode === "chat";

  const resolvedTheme =
    themeActive && projectTheme
      ? resolveThemeVars(projectTheme, userScheme)
      : null;

  // forceScheme(palette 한쪽만 선언)일 때만 scope-local override.
  // 이렇게 하면 Settings/Templates에 들어갔을 때 사용자 원래 모드로 자동 복귀한다.
  // color-scheme도 같이 잠가야 native scrollbar/caret이 forced palette와 일치한다.
  const rootStyle: CSSProperties | undefined = resolvedTheme
    ? {
        ...resolvedTheme.vars,
        ...(resolvedTheme.forceScheme
          ? { colorScheme: resolvedTheme.effectiveScheme }
          : null),
      }
    : undefined;
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
          <ErrorBoundary
            FallbackComponent={PageErrorFallback}
            resetKeys={[view.kind, activeProjectSlug]}
            onError={(error, info) => {
              console.error("[ErrorBoundary] PageContent", error, info.componentStack);
            }}
          >
            <PageContent
              view={view}
              agentPanelOpen={ui.agentPanelOpen}
              onToggleAgentPanel={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
              settingsCanGoBack={settingsBackSlug !== null}
              onSettingsBack={handleSettingsBack}
              libraryCanGoBack={settingsBackSlug !== null}
              onLibraryBack={handleSettingsBack}
              createFromTemplate={createFromTemplate}
              trustDialog={trustDialog}
            />
          </ErrorBoundary>
        </Suspense>
      </div>

      <OnboardingWizard
        createProject={createProject}
        openTemplates={openTemplates}
      />
      <ProjectReadmeModal />
    </div>
  );
}
