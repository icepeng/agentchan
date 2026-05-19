import { Suspense, lazy, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  ErrorBoundary,
  localStore,
  markSeen,
  useI18n,
} from "@/client/platform/index.js";
import { SessionProvider } from "@/client/creative-agent/index.js";
import { ProjectEditorProvider } from "@/client/project-editor/index.js";
import {
  useProjectTheme,
  resolveThemeVars,
} from "@/client/renderer-host/index.js";
import { useTheme } from "@/client/theme/index.js";
import { Sidebar } from "./Sidebar.js";
import { ProjectView } from "./ProjectView.js";
import { SettingsView } from "@/client/app-settings/index.js";
import { OnboardingWizard } from "@/client/onboarding/index.js";
import {
  ProjectReadmeModal,
  useCreateProjectFromTemplate,
  useProject,
  useProjects,
} from "@/client/project/index.js";
import { PageErrorFallback } from "./PageErrorFallback.js";
import { useView } from "./useView.js";
import { ViewProvider } from "./view/ViewContext.js";
import type { View } from "./view/viewReducer.js";

// Library page is lazy-loaded to keep it out of the main bundle.
const LibraryPage = lazy(() =>
  import("@/client/library/index.js").then((m) => ({ default: m.LibraryPage })),
);

function PageContent({
  view,
  settingsCanGoBack,
  onSettingsBack,
  onSettingsTabChange,
  libraryCanGoBack,
  onLibraryBack,
  createFromTemplate,
  trustDialog,
}: {
  view: View;
  settingsCanGoBack: boolean;
  onSettingsBack: () => void;
  onSettingsTabChange: (tab: "appearance" | "api-keys") => void;
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
      return (
        <SettingsView
          tab={view.tab}
          canGoBack={settingsCanGoBack}
          onBack={onSettingsBack}
          onTabChange={onSettingsTabChange}
        />
      );
    case "project":
      return <ProjectView />;
  }
}

export function AppShell() {
  return (
    <ViewProvider>
      <AppShellWithView />
    </ViewProvider>
  );
}

function useLastProjectBootstrap(selectProject: (slug: string) => Promise<unknown>) {
  const { data: projects } = useProjects();
  const decidedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current || !projects) return;
    decidedRef.current = true;

    const lastSlug = localStore.lastProject.read();
    const defaultProject = (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0];
    if (!defaultProject) return;

    void selectProject(defaultProject.slug);
  }, [projects, selectProject]);
}

function AppShellWithView() {
  const viewState = useView();
  const projectTheme = useProjectTheme();
  const { resolved: userScheme } = useTheme();
  const { createProject, projects, selectProject } = useProject();
  const { createFromTemplate, trustDialog } = useCreateProjectFromTemplate();
  const { t } = useI18n();

  const view = viewState.view;
  const activeProjectSlug = viewState.activeProjectSlug;
  useLastProjectBootstrap(selectProject);
  const openTemplates = () => viewState.dispatch({ type: "OPEN_TEMPLATES" });
  const settingsBackSlug = activeProjectSlug ?? projects[0]?.slug ?? null;
  const handleSettingsBack = () => {
    if (settingsBackSlug) void selectProject(settingsBackSlug);
  };
  const toggleViewMode = useCallback(() => {
    if (view.kind !== "project") return;
    viewState.dispatch({
      type: "SET_VIEW_MODE",
      mode: view.mode === "edit" ? "chat" : "edit",
    });
  }, [view, viewState]);

  // Ctrl+E / Cmd+E to toggle edit mode (project view only).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "e" && view.kind === "project") {
        e.preventDefault();
        toggleViewMode();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, toggleViewMode]);

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
    <SessionProvider
      slug={viewState.activeProjectSlug}
      sessionId={viewState.activeSessionId}
      viewMode={view.kind === "project" ? view.mode : null}
      onOpenSession={(sessionId) => viewState.dispatch({ type: "OPEN_SESSION", sessionId })}
      onRequestProjectActivation={(slug) => { void selectProject(slug); }}
      onRequestProjectReadme={() => viewState.dispatch({ type: "OPEN_PROJECT_README" })}
      onToggleViewMode={toggleViewMode}
    >
      <div
        className="flex h-full bg-void text-fg font-body transition-colors duration-300"
        style={rootStyle}
        data-theme={dataThemeOverride}
      >
        {/* Sidebar expand toggle — visible only when sidebar is collapsed */}
        <button
          onClick={() => viewState.dispatch({ type: "TOGGLE_SIDEBAR" })}
          className={`fixed top-3 left-3 z-50 p-2 rounded-lg bg-elevated border border-edge/6 hover:border-edge/12 transition-all duration-150 ${
            viewState.sidebarOpen ? "hidden" : "block"
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
            viewState.sidebarOpen
              ? "translate-x-0 lg:w-72"
              : "-translate-x-full lg:w-0"
          }`}
        >
          <Sidebar />
        </div>

        {/* Mobile backdrop when sidebar is open */}
        {viewState.sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-void/80 backdrop-blur-sm lg:hidden"
            onClick={() => viewState.dispatch({ type: "TOGGLE_SIDEBAR" })}
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
              <ProjectEditorProvider>
                <PageContent
                  view={view}
                  settingsCanGoBack={settingsBackSlug !== null}
                  onSettingsBack={handleSettingsBack}
                  onSettingsTabChange={(tab) => viewState.dispatch({ type: "OPEN_SETTINGS", tab })}
                  libraryCanGoBack={settingsBackSlug !== null}
                  onLibraryBack={handleSettingsBack}
                  createFromTemplate={createFromTemplate}
                  trustDialog={trustDialog}
                />
              </ProjectEditorProvider>
            </ErrorBoundary>
          </Suspense>
        </div>

        <OnboardingWizard
          createProject={createProject}
          openTemplates={openTemplates}
        />
        <ProjectReadmeModal
          open={viewState.readmeOpen}
          onClose={() => viewState.dispatch({ type: "CLOSE_PROJECT_README" })}
          activeProjectSlug={viewState.activeProjectSlug}
        />
      </div>
    </SessionProvider>
  );
}
