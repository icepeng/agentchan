import { useUIState, useUIDispatch } from "./context/UIContext.js";
import { useI18n } from "@/client/i18n/index.js";
import { IconButton } from "@/client/shared/ui/index.js";
import { ProjectTabs } from "@/client/features/project/index.js";
import { ModelBar } from "@/client/features/settings/index.js";
import { SkillList } from "./SkillList.js";

export function Sidebar() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full bg-base border-r border-edge/6">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div>
          <h1
            className="font-display text-lg font-bold tracking-tight cursor-pointer"
            onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "main" } })}
          >
            agent<span className="text-accent">chan</span>
          </h1>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            active={ui.currentPage.page === "settings"}
            onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "settings" } })}
            title={t("globalSettings.title")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Library */}
      <div className="px-2 border-t border-edge/6 pt-2 pb-1">
        <button
          onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "library" } })}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150 ${
            ui.currentPage.page === "library"
              ? "bg-elevated text-accent"
              : "text-fg-2 hover:text-fg hover:bg-elevated/50"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          {t("sidebar.library")}
        </button>
      </div>

      {/* Projects */}
      <div className="flex-1 overflow-y-auto border-t border-edge/6 pt-1 pb-2">
        <div className="px-5 pt-3 pb-1">
          <label className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
            {t("sidebar.projects")}
          </label>
        </div>
        <ProjectTabs />
      </div>

      {/* Bottom panel */}
      <div>
        <ModelBar />
        <SkillList />
      </div>
    </div>
  );
}
