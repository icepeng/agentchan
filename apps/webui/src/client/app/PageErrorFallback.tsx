import { Bug, RefreshCw, ShieldAlert } from "lucide-react";
import { useI18n } from "@/client/platform/index.js";
import type { FallbackProps } from "@/client/platform/index.js";

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function PageErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] bg-surface text-fg">
      <aside className="flex flex-col border-r border-edge/8 bg-base px-5 py-6">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-danger/20 bg-danger/10 text-danger">
          <ShieldAlert size={21} strokeWidth={2.4} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold leading-tight">
          {t("errorBoundary.areaTitle")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          {t("errorBoundary.areaDescription")}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={resetErrorBoundary}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-void transition-colors hover:bg-accent/90"
          >
            <RefreshCw size={15} />
            <span>{t("errorBoundary.retry")}</span>
          </button>
        </div>
      </aside>
      <main className="overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
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
      </main>
    </div>
  );
}
