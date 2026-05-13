import { AlertOctagon, RefreshCw } from "lucide-react";
import type { FallbackProps } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";

export function RootErrorFallback({ error }: FallbackProps) {
  const { t } = useI18n();

  return (
    <main className="grid min-h-full place-items-center bg-void px-6 py-12 text-fg">
      <section className="w-full max-w-lg text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertOctagon size={28} strokeWidth={2.3} />
        </div>
        <div className="mt-7 text-[10px] uppercase tracking-[0.32em] text-fg-4">
          agentchan
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
          {t("errorBoundary.fatalTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-2">
          {t("errorBoundary.fatalDescription")}
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-accent/90"
          >
            <RefreshCw size={15} />
            <span>{t("errorBoundary.reload")}</span>
          </button>
        </div>
        <details className="mx-auto mt-6 max-w-md text-left">
          <summary className="cursor-pointer text-center text-xs font-semibold uppercase tracking-[0.2em] text-fg-4">
            {t("errorBoundary.details")}
          </summary>
          <pre className="mt-3 overflow-auto rounded-md border border-edge/8 bg-elevated/70 p-3 text-xs leading-relaxed text-fg-3">
            {error instanceof Error ? error.stack ?? error.message : String(error)}
          </pre>
        </details>
      </section>
    </main>
  );
}
