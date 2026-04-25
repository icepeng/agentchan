import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useUIState, useUIDispatch, type PageRoute } from "@/client/entities/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { IconButton, ScrollArea, TabBar } from "@/client/shared/ui/index.js";
import { ApiKeysTab } from "./ApiKeysTab.js";
import { AppearanceTab } from "./AppearanceTab.js";

type SettingsTab = "appearance" | "api-keys";

export function SettingsView() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const route = ui.currentPage as Extract<PageRoute, { page: "settings" }>;
  const [tab, setTab] = useState<SettingsTab>(route.tab ?? "appearance");

  const tabLabels: Record<SettingsTab, string> = {
    appearance: t("globalSettings.appearance"),
    "api-keys": t("globalSettings.apiKeys"),
  };

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/60">
        <IconButton
          onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "main" } })}
          title={t("settings.back")}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </IconButton>
        <h2 className="font-display text-lg font-bold tracking-tight">{t("globalSettings.title")}</h2>
        <TabBar<SettingsTab>
          tabs={[
            { key: "appearance", label: tabLabels.appearance },
            { key: "api-keys", label: tabLabels["api-keys"] },
          ]}
          active={tab}
          onChange={setTab}
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
