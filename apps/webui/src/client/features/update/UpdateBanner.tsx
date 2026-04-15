import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  useUpdateStatus,
  readDismissedVersion,
  writeDismissedVersion,
} from "@/client/entities/update/index.js";
import { useI18n } from "@/client/i18n/index.js";

/**
 * Slim banner shown above the ModelBar when a newer release is published on
 * GitHub. Dismiss is sticky per-version: acknowledging v1.2.3 hides the banner
 * until v1.2.4 arrives.
 */
export function UpdateBanner() {
  const status = useUpdateStatus();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissedVersion());

  if (!status || !status.hasUpdate || !status.latest || !status.releaseUrl) return null;
  if (dismissed === status.latest) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!status.latest) return;
    writeDismissedVersion(status.latest);
    setDismissed(status.latest);
  };

  return (
    <a
      href={status.releaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 px-4 py-3 border-t border-edge/6 bg-accent/8 hover:bg-accent/12 transition-colors"
      title={t("update.viewRelease")}
    >
      <Sparkles size={14} strokeWidth={2} className="text-accent shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fg leading-tight">
          {t("update.available")}
        </div>
        <div className="text-[11px] text-fg-3 font-mono mt-0.5 truncate">
          {t("update.versionLine", { current: status.current, latest: status.latest })}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded text-fg-4 hover:text-fg-2 hover:bg-elevated/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title={t("update.dismiss")}
        aria-label={t("update.dismiss")}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </a>
  );
}
