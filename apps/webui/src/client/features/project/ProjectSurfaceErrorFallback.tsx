import { Bug, RefreshCw, ShieldAlert } from "lucide-react";
import { useI18n } from "@/client/i18n/index.js";
import type { FallbackProps } from "@/client/shared/ui/index.js";

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function ProjectSurfaceErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-fg">
      <div className="flex items-center gap-3 border-b border-edge/8 bg-base/60 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-danger/10 text-danger">
          <ShieldAlert size={18} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {t("errorBoundary.areaTitle")}
          </h1>
          <p className="truncate text-xs text-fg-3">
            {t("errorBoundary.areaDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-void transition-colors hover:bg-accent/90"
        >
          <RefreshCw size={14} />
          <span>{t("errorBoundary.retry")}</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-fg-4">
            <Bug size={13} />
            <span>{t("errorBoundary.details")}</span>
          </summary>
          <pre className="mt-4 overflow-auto rounded-md border border-edge/8 bg-void/45 p-4 font-mono text-xs leading-relaxed text-fg-3">
            {errorText(error)}
          </pre>
        </details>
      </div>
    </div>
  );
}
