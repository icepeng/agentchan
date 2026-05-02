import { ArrowLeft } from "lucide-react";
import {
  useViewState,
  useViewDispatch,
} from "@/client/entities/view/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { useProject } from "@/client/features/project/index.js";
import { IconButton, ScrollArea, TabBar } from "@/client/shared/ui/index.js";
import { ApiKeysTab } from "./ApiKeysTab.js";
import { AppearanceTab } from "./AppearanceTab.js";

type SettingsTab = "appearance" | "api-keys";

export function SettingsView() {
  const view = useViewState().view;
  const viewDispatch = useViewDispatch();
  const { t } = useI18n();
  const { projects, selectProject, activeProjectSlug } = useProject();

  // SettingsView is rendered by AppShell only when view.kind === "settings".
  if (view.kind !== "settings") return null;
  const tab: SettingsTab = view.tab;

  const tabLabels: Record<SettingsTab, string> = {
    appearance: t("globalSettings.appearance"),
    "api-keys": t("globalSettings.apiKeys"),
  };

  const handleBack = () => {
    const fallbackSlug = activeProjectSlug ?? projects[0]?.slug ?? null;
    if (fallbackSlug) void selectProject(fallbackSlug);
  };
  const canGoBack = (activeProjectSlug ?? projects[0]?.slug) != null;

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/60">
        {canGoBack && (
          <IconButton onClick={handleBack} title={t("settings.back")}>
            <ArrowLeft size={16} strokeWidth={2} />
          </IconButton>
        )}
        <h2 className="font-display text-lg font-bold tracking-tight">{t("globalSettings.title")}</h2>
        <TabBar<SettingsTab>
          tabs={[
            { key: "appearance", label: tabLabels.appearance },
            { key: "api-keys", label: tabLabels["api-keys"] },
          ]}
          active={tab}
          onChange={(next) => viewDispatch({ type: "OPEN_SETTINGS", tab: next })}
          className="ml-4"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {tab === "appearance" && <AppearanceTab />}
        {tab === "api-keys" && <ApiKeysTab />}
      </ScrollArea>
    </div>
  );
}
