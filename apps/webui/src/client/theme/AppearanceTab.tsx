import { useI18n } from "@/client/platform/index.js";
import { OptionCardGrid, SectionHeader } from "@/client/design-system/index.js";
import { useTheme, useThemeOptions } from "./useTheme.js";

export function AppearanceTab() {
  const { t } = useI18n();
  const { preference: themePref, setPreference: setThemePref } = useTheme();
  const themeOptions = useThemeOptions();

  return (
    <section className="space-y-4">
      <SectionHeader title={t("globalSettings.theme")} />
      <OptionCardGrid options={themeOptions} active={themePref} onChange={setThemePref} />
    </section>
  );
}
