import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { useI18n, type LanguagePreference } from "@/client/i18n/index.js";
import { OptionCardGrid, SectionHeader } from "@/client/shared/ui/index.js";
import { AboutSection } from "@/client/features/update/index.js";
import { NotificationsSection } from "./NotificationsSection.js";
import { useTheme, useThemeOptions } from "./useTheme.js";

export function AppearanceTab() {
  const { t } = useI18n();
  const { preference: themePref, setPreference: setThemePref } = useTheme();
  const themeOptions = useThemeOptions();
  const { preference: langPref, setPreference: setLangPref } = useI18n();

  const langOptions: { value: LanguagePreference; label: string; desc: string; icon: ReactNode }[] = [
    {
      value: "system",
      label: t("globalSettings.langSystem"),
      desc: t("globalSettings.langSystemDesc"),
      icon: <Globe size={20} strokeWidth={1.8} />,
    },
    {
      value: "en",
      label: t("globalSettings.langEn"),
      desc: "English",
      icon: <span className="text-sm font-bold font-mono leading-none select-none">EN</span>,
    },
    {
      value: "ko",
      label: t("globalSettings.langKo"),
      desc: "한국어",
      icon: <span className="text-sm font-bold font-mono leading-none select-none">KO</span>,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10 animate-fade-slide">
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.theme")} />
        <OptionCardGrid options={themeOptions} active={themePref} onChange={setThemePref} />
      </section>

      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.language")} />
        <OptionCardGrid options={langOptions} active={langPref} onChange={setLangPref} />
      </section>

      <section className="space-y-4">
        <SectionHeader title={t("notifications.title")} />
        <NotificationsSection />
      </section>

      <section className="space-y-4">
        <SectionHeader title={t("update.currentVersion")} />
        <AboutSection />
      </section>
    </div>
  );
}
