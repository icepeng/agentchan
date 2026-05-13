import { AlertTriangle, RefreshCw } from "lucide-react";
import { useI18n } from "@/client/i18n/index.js";
import type { FallbackProps } from "@/client/shared/ui/index.js";

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function AgentPanelErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col bg-base/40 p-4 text-fg">
      <div className="rounded-md border border-danger/20 bg-danger/5 p-4">
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle size={18} strokeWidth={2.4} />
          <h1 className="text-sm font-semibold">
            {t("errorBoundary.panelTitle")}
          </h1>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          {t("errorBoundary.panelDescription")}
        </p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-void transition-colors hover:bg-accent/90"
        >
          <RefreshCw size={14} />
          <span>{t("errorBoundary.retry")}</span>
        </button>
        <details className="mt-4">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.2em] text-fg-4">
            {t("errorBoundary.details")}
          </summary>
          <pre className="mt-3 max-h-52 overflow-auto rounded-md border border-edge/8 bg-void/45 p-3 font-mono text-xs leading-relaxed text-fg-3">
            {errorText(error)}
          </pre>
        </details>
      </div>
    </div>
  );
}
