import { Sparkles, CheckCircle2 } from "lucide-react";
import { useUpdateStatus } from "@/client/entities/update/index.js";
import { useI18n } from "@/client/i18n/index.js";

/**
 * Read-only "about" block for the settings page. Surfaces the running version
 * and, when the server has confirmed a newer release on GitHub, a link to it.
 */
export function AboutSection() {
  const status = useUpdateStatus();
  const { t } = useI18n();

  const current = status?.current ?? "…";

  return (
    <div className="rounded-xl border border-edge/8 bg-elevated/40 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg">{t("update.currentVersion")}</div>
          <div className="text-xs text-fg-3 font-mono mt-1">v{current}</div>
        </div>
        {status && !status.hasUpdate && status.latest != null && (
          <div className="flex items-center gap-1.5 text-xs text-fg-3 shrink-0">
            <CheckCircle2 size={13} strokeWidth={2} className="text-accent" />
            {t("update.upToDate")}
          </div>
        )}
      </div>
      {status?.hasUpdate && status.latest && status.releaseUrl && (
        <a
          href={status.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-accent/8 hover:bg-accent/12 transition-colors"
        >
          <Sparkles size={14} strokeWidth={2} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-fg">{t("update.available")}</div>
            <div className="text-[11px] text-fg-3 font-mono mt-0.5">
              {t("update.versionLine", { current: status.current, latest: status.latest })}
            </div>
          </div>
          <span className="text-xs text-accent shrink-0 self-center">
            {t("update.viewRelease")}
          </span>
        </a>
      )}
    </div>
  );
}
