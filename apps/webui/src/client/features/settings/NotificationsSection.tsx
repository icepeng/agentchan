import { useState } from "react";
import { useI18n } from "@/client/i18n/index.js";
import {
  notificationPermission,
  requestNotificationPermission,
  type NotificationPreference,
} from "@/client/shared/notifications.js";
import { localStore } from "@/client/shared/storage.js";

export function NotificationsSection() {
  const { t } = useI18n();
  const [pref, setPref] = useState<NotificationPreference>(() => localStore.notifications.read());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => notificationPermission(),
  );

  const handleToggle = async (next: NotificationPreference) => {
    setPref(next);
    localStore.notifications.write(next);
    if (next === "on" && permission === "default") {
      const result = await requestNotificationPermission();
      setPermission(result);
    }
  };

  const blocked = permission === "denied";
  const statusLabel =
    pref === "off"
      ? t("notifications.disabled")
      : blocked
        ? t("notifications.blocked")
        : t("notifications.enabled");

  return (
    <div className="rounded-xl border border-edge/8 bg-elevated/40 px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg">{t("notifications.desktopLabel")}</div>
          <div className="text-xs text-fg-3 mt-1">{t("notifications.desktopDesc")}</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={pref === "on"}
            onChange={(e) => void handleToggle(e.target.checked ? "on" : "off")}
          />
          <span className="w-9 h-5 bg-surface rounded-full peer peer-checked:bg-accent transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-void after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
        </label>
      </div>
      <div className={`text-xs ${blocked && pref === "on" ? "text-danger" : "text-fg-3"}`}>
        {statusLabel}
      </div>
    </div>
  );
}
