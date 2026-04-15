import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useUpdateStatus } from "@/client/entities/update/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { localStore } from "@/client/shared/storage.js";

// Dismiss is per-version: acknowledging v1.2.3 hides the banner until v1.2.4 arrives.
export function UpdateBanner() {
  const status = useUpdateStatus();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState<string | null>(() => localStore.updateDismissed.read());

  if (!status || !status.hasUpdate || !status.latest || !status.releaseUrl) return null;
  if (dismissed === status.latest) return null;

  const handleDismiss = () => {
    if (!status.latest) return;
    localStore.updateDismissed.write(status.latest);
    setDismissed(status.latest);
  };

  // <a> and <button> are siblings — nesting a button inside an anchor is invalid
  // HTML and breaks screen-reader/keyboard navigation. The button is absolutely
  // positioned over the anchor so the layout still reads as a single row.
  return (
    <div className="relative group border-t border-edge/6 bg-accent/8 hover:bg-accent/12 transition-colors">
      <a
        href={status.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2.5 px-4 py-3"
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
      </a>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-0.5 rounded text-fg-4 hover:text-fg-2 hover:bg-elevated/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title={t("update.dismiss")}
        aria-label={t("update.dismiss")}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}
