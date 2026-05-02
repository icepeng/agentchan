import { BookOpen, PanelLeftClose, Settings } from "lucide-react";
import { useUIDispatch } from "@/client/entities/ui/index.js";
import { useViewState, useViewDispatch } from "@/client/entities/view/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { IconButton, ScrollArea } from "@/client/shared/ui/index.js";
import { ProjectTabs, useProject } from "@/client/features/project/index.js";
import { ModelBar } from "@/client/features/settings/index.js";
import { UpdateBanner } from "@/client/features/update/index.js";
import { localStore } from "@/client/shared/storage.js";

export function Sidebar() {
  const view = useViewState().view;
  const viewDispatch = useViewDispatch();
  const uiDispatch = useUIDispatch();
  const { projects, selectProject } = useProject();
  const { t } = useI18n();

  // "Home" = last-active project view, falling back to templates when there
  // is no project to return to. There is no longer a separate "main" kind.
  const goHome = () => {
    if (view.kind === "project") return;
    const lastSlug = localStore.lastProject.read();
    const target =
      (lastSlug && projects.find((p) => p.slug === lastSlug)) ?? projects[0];
    if (target) {
      void selectProject(target.slug);
    } else {
      viewDispatch({ type: "OPEN_TEMPLATES" });
    }
  };

  return (
    <div className="flex flex-col w-72 h-full bg-base border-r border-edge/6 transition-colors duration-300">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div>
          <h1
            className="font-display text-lg font-bold tracking-tight cursor-pointer"
            onClick={goHome}
          >
            agent<span className="text-accent">chan</span>
          </h1>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            active={view.kind === "settings"}
            onClick={() => viewDispatch({ type: "OPEN_SETTINGS" })}
            title={t("globalSettings.title")}
          >
            <Settings size={15} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            onClick={() => uiDispatch({ type: "TOGGLE_SIDEBAR" })}
            title={t("ui.sidebar.collapse")}
          >
            <PanelLeftClose size={15} strokeWidth={1.8} />
          </IconButton>
        </div>
      </div>

      {/* Templates */}
      <div className="px-2 border-t border-edge/6 pt-2 pb-1">
        <button
          onClick={() => viewDispatch({ type: "OPEN_TEMPLATES" })}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150 ${
            view.kind === "templates"
              ? "bg-elevated text-accent"
              : "text-fg-2 hover:text-fg hover:bg-elevated/50"
          }`}
        >
          <BookOpen size={14} strokeWidth={2} />
          {t("sidebar.templates")}
        </button>
      </div>

      {/* Projects */}
      <ScrollArea className="flex-1 border-t border-edge/6" viewportClassName="pt-1 pb-2">
        <div className="px-5 pt-3 pb-1">
          <label className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
            {t("sidebar.projects")}
          </label>
        </div>
        <ProjectTabs />
      </ScrollArea>

      {/* Bottom panel */}
      <div>
        <UpdateBanner />
        <ModelBar />
      </div>
    </div>
  );
}
