import { SettingsView } from "@/client/features/settings/index.js";

export function AppSettingsPage({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean;
  onBack: () => void;
}) {
  return <SettingsView canGoBack={canGoBack} onBack={onBack} />;
}
