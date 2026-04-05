import { useUIState, useUIDispatch } from "./context/UIContext.js";
import { Sidebar } from "./Sidebar.js";
import { ProjectPage } from "@/client/pages/ProjectPage.js";
import { LibraryPage } from "@/client/pages/LibraryPage.js";
import { ProjectSettingsPage } from "@/client/pages/ProjectSettingsPage.js";
import { AppSettingsPage } from "@/client/pages/AppSettingsPage.js";
import { OnboardingWizard } from "@/client/features/onboarding/index.js";

function PageContent({ page, agentPanelOpen, onToggleAgentPanel }: {
  page: string;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
}) {
  switch (page) {
    case "library":
      return <LibraryPage />;
    case "project-settings":
      return <ProjectSettingsPage />;
    case "settings":
      return <AppSettingsPage />;
    default:
      return <ProjectPage agentPanelOpen={agentPanelOpen} onToggleAgentPanel={onToggleAgentPanel} />;
  }
}

export function AppShell() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();

  return (
    <div className="flex h-full bg-void text-fg font-body">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => uiDispatch({ type: "TOGGLE_SIDEBAR" })}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-elevated border border-edge/6 hover:border-edge/12 lg:hidden transition-all duration-150"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" className="text-fg-2">
          <path
            fillRule="evenodd"
            d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0 ${
          ui.sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {ui.sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-void/80 backdrop-blur-sm lg:hidden"
          onClick={() => uiDispatch({ type: "TOGGLE_SIDEBAR" })}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <PageContent
          page={ui.currentPage.page}
          agentPanelOpen={ui.agentPanelOpen}
          onToggleAgentPanel={() => uiDispatch({ type: "TOGGLE_AGENT_PANEL" })}
        />
      </div>

      <OnboardingWizard />
    </div>
  );
}
